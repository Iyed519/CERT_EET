import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError, QueryRunner } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import {
  MESSAGE_ARCHIVEE,
  MESSAGE_DEJA_AFFECTE,
  MESSAGE_DEJA_EN_ATTENTE,
  MESSAGE_DEJA_TRAITEE,
  MESSAGE_FORMATEUR_INACTIF,
  MESSAGE_MOTIF,
  StatutDemandeAffectation,
  formationOuverteAuxDemandes,
  modifiable,
  motifValide,
} from './demandes-affectation.regles';

const VIOLATION_UNICITE = '23505';

interface Contexte {
  adresseIp: string | null;
}

/** Vue d'une demande pour son auteur (US-FORM-07). */
export interface DemandeAffectationVue {
  id: string;
  formation: { id: string; titre: string; statut: string };
  motif: string;
  statut: StatutDemandeAffectation;
  motifRefus: string | null;
  traiteLe: Date | null;
  creeLe: Date;
}

/** Vue administrateur : identité du demandeur et auteur de la décision. */
export interface DemandeAffectationAdminVue extends DemandeAffectationVue {
  formateur: { id: string; email: string; prenom: string | null; nom: string | null };
  traitePar: string | null;
}

export interface DemandeAffectationPage {
  items: DemandeAffectationAdminVue[];
  total: number;
  page: number;
  limit: number;
}

/** Formation que le formateur peut demander (non archivée, pas encore la sienne). */
export interface FormationDisponible {
  id: string;
  titre: string;
  statut: string;
  dateDebut: string | null;
  dateFin: string | null;
  demandeEnAttente: boolean;
}

interface Ligne {
  id: string;
  formation_id: string;
  formation_titre: string;
  formation_statut: string;
  formateur_id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
  motif: string;
  statut: StatutDemandeAffectation;
  motif_refus: string | null;
  traite_par: string | null;
  traite_le: Date | null;
  cree_le: Date;
}

const SELECT_DEMANDE = `
  SELECT d.id, d.formation_id, f.titre AS formation_titre, f.statut::text AS formation_statut,
         d.formateur_id, u.email, u.prenom, u.nom, d.motif, d.statut, d.motif_refus,
         d.traite_par, d.traite_le, d.cree_le
    FROM demandes_affectation d
    JOIN formations f ON f.id = d.formation_id
    JOIN users u ON u.id = d.formateur_id`;

/**
 * US-FORM-07 — Un formateur demande à enseigner une formation existante ;
 * un administrateur accepte (l'affectation est créée dans la MÊME
 * transaction) ou refuse avec un motif ; le formateur peut annuler une
 * demande en attente. Calqué sur les demandes de rôle (US-ROL-02).
 *
 * Concurrence : création sous verrou de la ligne du formateur (deux envois
 * simultanés sont sérialisés) avec l'index unique partiel en filet ;
 * décision sous verrou de la demande (FOR UPDATE) ; refus et annulation par
 * UPDATE conditionnel (statut = EN_ATTENTE) : une seule décision gagne.
 */
@Injectable()
export class DemandesAffectationService {
  private readonly logger = new Logger(DemandesAffectationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  // ----------------------------------------------------------------- formateur

  async creer(
    formateurId: string,
    formationId: string,
    motifBrut: string,
    contexte: Contexte,
  ): Promise<DemandeAffectationVue> {
    if (!motifValide(motifBrut)) throw new BadRequestException(MESSAGE_MOTIF);
    const motif = motifBrut.trim();
    const id = await this.transaction(async (qr) => {
      // Verrou : les demandes d'un même formateur passent une par une.
      await qr.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [formateurId]);
      const [formation] = (await qr.query(
        `SELECT id, statut::text AS statut FROM formations WHERE id = $1`,
        [formationId],
      )) as Array<{ id: string; statut: string }>;
      if (!formation) throw new NotFoundException('Formation introuvable.');
      if (!formationOuverteAuxDemandes(formation.statut)) {
        throw new BadRequestException(MESSAGE_ARCHIVEE);
      }
      const [affecte] = (await qr.query(
        `SELECT 1 FROM formation_formateurs WHERE formation_id = $1 AND formateur_id = $2`,
        [formationId, formateurId],
      )) as unknown[];
      if (affecte) throw new ConflictException(MESSAGE_DEJA_AFFECTE);
      const [enAttente] = (await qr.query(
        `SELECT 1 FROM demandes_affectation
          WHERE formation_id = $1 AND formateur_id = $2 AND statut = 'EN_ATTENTE'`,
        [formationId, formateurId],
      )) as unknown[];
      if (enAttente) throw new ConflictException(MESSAGE_DEJA_EN_ATTENTE);
      const [cree] = (await qr.query(
        `INSERT INTO demandes_affectation (formation_id, formateur_id, motif)
         VALUES ($1, $2, $3) RETURNING id`,
        [formationId, formateurId, motif],
      )) as Array<{ id: string }>;
      return cree.id;
    }).catch((erreur: unknown) => {
      if (this.violationUnicite(erreur)) throw new ConflictException(MESSAGE_DEJA_EN_ATTENTE);
      throw erreur;
    });
    await this.auditService.record({
      action: 'DEMANDE_AFFECTATION_CREEE',
      acteur: formateurId,
      cible: formationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { demandeId: id },
    });
    return this.vue(await this.charger(id));
  }

  async mesDemandes(formateurId: string): Promise<DemandeAffectationVue[]> {
    const lignes = (await this.dataSource.query(
      `${SELECT_DEMANDE} WHERE d.formateur_id = $1 ORDER BY d.cree_le DESC, d.id`,
      [formateurId],
    )) as Ligne[];
    return lignes.map((l) => this.vue(l));
  }

  async formationsDisponibles(formateurId: string): Promise<FormationDisponible[]> {
    const lignes = (await this.dataSource.query(
      `SELECT f.id, f.titre, f.statut::text AS statut, f.date_debut, f.date_fin,
              EXISTS (SELECT 1 FROM demandes_affectation d
                       WHERE d.formation_id = f.id AND d.formateur_id = $1
                         AND d.statut = 'EN_ATTENTE') AS en_attente
         FROM formations f
        WHERE f.statut IN ('OUVERTE', 'FERMEE')
          AND NOT EXISTS (SELECT 1 FROM formation_formateurs ff
                           WHERE ff.formation_id = f.id AND ff.formateur_id = $1)
        ORDER BY f.titre, f.id`,
      [formateurId],
    )) as Array<{
      id: string;
      titre: string;
      statut: string;
      date_debut: string | null;
      date_fin: string | null;
      en_attente: boolean;
    }>;
    return lignes.map((l) => ({
      id: l.id,
      titre: l.titre,
      statut: l.statut,
      dateDebut: l.date_debut,
      dateFin: l.date_fin,
      demandeEnAttente: l.en_attente,
    }));
  }

  async annuler(
    formateurId: string,
    demandeId: string,
    contexte: Contexte,
  ): Promise<DemandeAffectationVue> {
    const [lignes] = (await this.dataSource.query(
      `UPDATE demandes_affectation SET statut = 'ANNULEE', traite_le = now()
        WHERE id = $1 AND formateur_id = $2 AND statut = 'EN_ATTENTE'
        RETURNING formation_id`,
      [demandeId, formateurId],
    )) as [Array<{ formation_id: string }>, number];
    if (lignes.length === 0) {
      const existe = await this.trouver(demandeId);
      // Celle d'un autre : 404, sans révéler qu'elle existe.
      if (!existe || existe.formateur_id !== formateurId) {
        throw new NotFoundException('Demande introuvable.');
      }
      throw new ConflictException(MESSAGE_DEJA_TRAITEE);
    }
    await this.auditService.record({
      action: 'DEMANDE_AFFECTATION_ANNULEE',
      acteur: formateurId,
      cible: lignes[0].formation_id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { demandeId },
    });
    return this.vue(await this.charger(demandeId));
  }

  // ------------------------------------------------------------ administrateur

  async lister(filtre: {
    statut?: StatutDemandeAffectation;
    page?: number;
    limit?: number;
  }): Promise<DemandeAffectationPage> {
    const page = filtre.page ?? 1;
    const limit = filtre.limit ?? 50;
    const condition = filtre.statut ? 'WHERE d.statut = $3' : '';
    const parametres: unknown[] = [limit, (page - 1) * limit];
    if (filtre.statut) parametres.push(filtre.statut);
    const [lignes, [{ total }]] = await Promise.all([
      this.dataSource.query(
        `${SELECT_DEMANDE} ${condition} ORDER BY d.cree_le DESC, d.id LIMIT $1 OFFSET $2`,
        parametres,
      ) as Promise<Ligne[]>,
      this.dataSource.query(
        `SELECT count(*)::int AS total FROM demandes_affectation d ${filtre.statut ? 'WHERE d.statut = $1' : ''}`,
        filtre.statut ? [filtre.statut] : [],
      ) as Promise<Array<{ total: number }>>,
    ]);
    return { items: lignes.map((l) => this.vueAdmin(l)), total, page, limit };
  }

  async accepter(
    adminId: string,
    demandeId: string,
    contexte: Contexte,
  ): Promise<DemandeAffectationAdminVue> {
    const affectationCreee = await this.transaction(async (qr) => {
      const [demande] = (await qr.query(
        `SELECT id, formation_id, formateur_id, statut FROM demandes_affectation
          WHERE id = $1 FOR UPDATE`,
        [demandeId],
      )) as Array<{ id: string; formation_id: string; formateur_id: string; statut: string }>;
      if (!demande) throw new NotFoundException('Demande introuvable.');
      if (!modifiable(demande.statut)) throw new ConflictException(MESSAGE_DEJA_TRAITEE);
      const [formation] = (await qr.query(
        `SELECT statut::text AS statut FROM formations WHERE id = $1 FOR UPDATE`,
        [demande.formation_id],
      )) as Array<{ statut: string }>;
      if (!formationOuverteAuxDemandes(formation.statut)) throw new ConflictException(MESSAGE_ARCHIVEE);
      const [formateur] = (await qr.query(
        `SELECT role::text AS role, statut::text AS statut FROM users WHERE id = $1`,
        [demande.formateur_id],
      )) as Array<{ role: string; statut: string }>;
      if (formateur.role !== 'FORMATEUR' || formateur.statut !== 'ACTIF') {
        throw new ConflictException(MESSAGE_FORMATEUR_INACTIF);
      }
      const creee = (await qr.query(
        `INSERT INTO formation_formateurs (formation_id, formateur_id, affecte_par)
         VALUES ($1, $2, $3)
         ON CONFLICT (formation_id, formateur_id) DO NOTHING RETURNING id`,
        [demande.formation_id, demande.formateur_id, adminId],
      )) as unknown[];
      await qr.query(
        `UPDATE demandes_affectation SET statut = 'ACCEPTEE', traite_par = $2, traite_le = now()
          WHERE id = $1`,
        [demandeId, adminId],
      );
      return creee.length > 0;
    });
    const demande = await this.charger(demandeId);
    const notificationEnvoyee = await this.notifier(demande, true);
    await this.auditService.record({
      action: 'DEMANDE_AFFECTATION_ACCEPTEE',
      acteur: adminId,
      cible: demande.formation_id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        demandeId,
        formateurId: demande.formateur_id,
        affectationCreee,
        notificationEnvoyee,
      },
    });
    return this.vueAdmin(demande);
  }

  async refuser(
    adminId: string,
    demandeId: string,
    motifBrut: string,
    contexte: Contexte,
  ): Promise<DemandeAffectationAdminVue> {
    if (!motifValide(motifBrut)) throw new BadRequestException(MESSAGE_MOTIF);
    const [lignes] = (await this.dataSource.query(
      `UPDATE demandes_affectation
          SET statut = 'REFUSEE', motif_refus = $3, traite_par = $2, traite_le = now()
        WHERE id = $1 AND statut = 'EN_ATTENTE'
        RETURNING id`,
      [demandeId, adminId, motifBrut.trim()],
    )) as [Array<{ id: string }>, number];
    if (lignes.length === 0) {
      if (!(await this.trouver(demandeId))) throw new NotFoundException('Demande introuvable.');
      throw new ConflictException(MESSAGE_DEJA_TRAITEE);
    }
    const demande = await this.charger(demandeId);
    const notificationEnvoyee = await this.notifier(demande, false);
    await this.auditService.record({
      action: 'DEMANDE_AFFECTATION_REFUSEE',
      acteur: adminId,
      cible: demande.formation_id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { demandeId, formateurId: demande.formateur_id, notificationEnvoyee },
    });
    return this.vueAdmin(demande);
  }

  // ------------------------------------------------------------------- interne

  private async notifier(demande: Ligne, acceptee: boolean): Promise<boolean> {
    try {
      await this.mailService.sendDecisionDemandeAffectationEmail(demande.email, {
        prenom: demande.prenom,
        titreFormation: demande.formation_titre,
        formationId: demande.formation_id,
        acceptee,
        motifRefus: demande.motif_refus,
      });
      return true;
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Email de décision non envoyé (demande ${demande.id}) : ${detail}`);
      return false;
    }
  }

  private async trouver(id: string): Promise<Ligne | null> {
    const [ligne] = (await this.dataSource.query(`${SELECT_DEMANDE} WHERE d.id = $1`, [
      id,
    ])) as Ligne[];
    return ligne ?? null;
  }

  private async charger(id: string): Promise<Ligne> {
    const ligne = await this.trouver(id);
    if (!ligne) throw new NotFoundException('Demande introuvable.');
    return ligne;
  }

  private vue(l: Ligne): DemandeAffectationVue {
    return {
      id: l.id,
      formation: { id: l.formation_id, titre: l.formation_titre, statut: l.formation_statut },
      motif: l.motif,
      statut: l.statut,
      motifRefus: l.motif_refus,
      traiteLe: l.traite_le,
      creeLe: l.cree_le,
    };
  }

  private vueAdmin(l: Ligne): DemandeAffectationAdminVue {
    return {
      ...this.vue(l),
      formateur: { id: l.formateur_id, email: l.email, prenom: l.prenom, nom: l.nom },
      traitePar: l.traite_par,
    };
  }

  private violationUnicite(erreur: unknown): boolean {
    return (
      erreur instanceof QueryFailedError &&
      (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
    );
  }

  private async transaction<T>(travail: (qr: QueryRunner) => Promise<T>): Promise<T> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const resultat = await travail(qr);
      await qr.commitTransaction();
      return resultat;
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StatutFormation } from '../../../database/enums/statut-formation.enum';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import {
  LIBELLES_RESULTAT,
  LigneImport,
  ResultatLigne,
  bilan,
  emailValide,
  lireFichier,
} from './import-inscriptions.regles';

export const MESSAGE_INSCRIPTION_INTROUVABLE = 'Inscription introuvable.';
export const MESSAGE_DEJA_SUSPENDUE = 'Cette inscription est déjà suspendue.';
export const MESSAGE_PAS_SUSPENDUE = 'Seule une inscription suspendue peut être réactivée.';
export const MESSAGE_SUSPENSION_IMPOSSIBLE = 'Seule une inscription en cours peut être suspendue.';
export const MESSAGE_FORMATION_COMPLETE = 'Formation complète : il ne reste aucune place.';
export const MESSAGE_FORMATION_NON_OUVERTE =
  'Cette formation n’est pas ouverte : aucune nouvelle inscription n’est possible.';
export const MESSAGE_FORMATION_ARCHIVEE =
  'Cette formation est archivée : ses inscriptions ne changent plus.';

/** Une inscription vue par l'administrateur. */
export interface InscriptionAdminVue {
  id: string;
  statut: string;
  dateInscription: Date;
  tauxAvancement: number;
  motifSuspension: string | null;
  dateSuspension: Date | null;
  apprenant: { id: string; email: string; prenom: string | null; nom: string | null };
}

/** Résultat d'une ligne de l'import. */
export interface LigneRapport {
  ligne: number;
  email: string;
  resultat: ResultatLigne;
  libelle: string;
}

export interface RapportImport {
  total: number;
  bilan: Record<ResultatLigne, number>;
  lignes: LigneRapport[];
}

interface Formation {
  id: string;
  titre: string;
  statut: StatutFormation;
  capacite_max: number;
  date_debut: string | null;
  date_fin: string | null;
}

const SELECT_INSCRIPTION = `
  SELECT i.id, i.statut::text AS statut, i.date_inscription AS "dateInscription",
         i.taux_avancement::float AS "tauxAvancement", i.motif_suspension AS "motifSuspension",
         i.date_suspension AS "dateSuspension",
         json_build_object('id', u.id, 'email', u.email, 'prenom', u.prenom, 'nom', u.nom) AS apprenant
    FROM inscriptions i JOIN users u ON u.id = i.apprenant_id`;

/**
 * US-INSC-02 — Gérer les inscriptions d'une formation (UC4 Administrateur,
 * DS-08 P3, DS-11 P2).
 *
 * - Lister, inscrire un apprenant par son email, suspendre (motif
 *   obligatoire, jamais de suppression), réactiver (ré-inscrire), importer
 *   un CSV borné avec un rapport ligne par ligne.
 * - Capacité : toute place prise passe sous VERROU de la formation
 *   (SELECT … FOR UPDATE), comme l'inscription en libre-service : ni deux
 *   ajouts simultanés ni un import ne dépassent la capacité.
 * - Transitions conditionnelles (`UPDATE … WHERE statut = …`) : deux
 *   suspensions simultanées -> une seule passe.
 * - Audit INSCRIPTION_AJOUTEE / _SUSPENDUE / _REACTIVEE / INSCRIPTIONS_IMPORTEES ;
 *   emails à l'apprenant après validation (au mieux, jamais bloquants).
 */
@Injectable()
export class AdminInscriptionsService {
  private readonly logger = new Logger(AdminInscriptionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async lister(formationId: string, statut?: string): Promise<InscriptionAdminVue[]> {
    await this.formation(this.dataSource.manager, formationId, false);
    return (await this.dataSource.query(
      `${SELECT_INSCRIPTION}
        WHERE i.formation_id = $1 AND ($2::text IS NULL OR i.statut::text = $2)
        ORDER BY u.nom COLLATE "C" NULLS LAST, u.prenom COLLATE "C" NULLS LAST, u.email COLLATE "C"`,
      [formationId, statut ?? null],
    )) as InscriptionAdminVue[];
  }

  /** Inscrire un apprenant existant par son email (400 / 404 / 409 selon le cas). */
  async inscrire(
    adminId: string,
    formationId: string,
    email: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<InscriptionAdminVue> {
    const { id, formation, apprenantId } = await this.dataSource.transaction(async (m) => {
      const formation = await this.formation(m, formationId, true);
      if (formation.statut !== StatutFormation.OUVERTE) {
        throw new ConflictException(MESSAGE_FORMATION_NON_OUVERTE);
      }
      const r = await this.inscrireLigne(
        m,
        formation,
        email.trim().toLowerCase(),
        await this.places(m, formation),
      );
      if (r.resultat !== 'INSCRIT') throw this.erreurLigne(r.resultat);
      return { id: r.inscriptionId as string, formation, apprenantId: r.apprenantId as string };
    });
    await this.auditService.record({
      action: 'INSCRIPTION_AJOUTEE',
      acteur: adminId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { formationId, apprenantId },
    });
    await this.bienvenue(apprenantId, formation);
    return this.uneInscription(id);
  }

  /** Suspendre une inscription EN_COURS (motif obligatoire). */
  async suspendre(
    adminId: string,
    inscriptionId: string,
    motif: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<InscriptionAdminVue> {
    const avant = await this.ligneInscription(inscriptionId);
    if (avant.formation_statut === StatutFormation.ARCHIVEE) {
      throw new ConflictException(MESSAGE_FORMATION_ARCHIVEE);
    }
    const [lignes] = (await this.dataSource.query(
      `UPDATE inscriptions
          SET statut = 'SUSPENDUE', motif_suspension = $2, date_suspension = now(),
              suspendue_par = $3, updated_at = now()
        WHERE id = $1 AND statut = 'EN_COURS'
      RETURNING id`,
      [inscriptionId, motif.trim(), adminId],
    )) as [unknown[], number];
    if (lignes.length === 0) {
      const actuel = await this.ligneInscription(inscriptionId);
      throw new ConflictException(
        actuel.statut === 'SUSPENDUE' ? MESSAGE_DEJA_SUSPENDUE : MESSAGE_SUSPENSION_IMPOSSIBLE,
      );
    }
    await this.auditService.record({
      action: 'INSCRIPTION_SUSPENDUE',
      acteur: adminId,
      cible: inscriptionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant: avant.statut, apres: 'SUSPENDUE', motif: motif.trim() },
    });
    await this.notifierStatut(avant.apprenant_id, avant.formation_titre, true, motif.trim());
    return this.uneInscription(inscriptionId);
  }

  /** Réactiver (ré-inscrire) une inscription SUSPENDUE, sous la capacité. */
  async reactiver(
    adminId: string,
    inscriptionId: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<InscriptionAdminVue> {
    const avant = await this.ligneInscription(inscriptionId);
    await this.dataSource.transaction(async (m) => {
      const formation = await this.formation(m, avant.formation_id, true);
      if (formation.statut === StatutFormation.ARCHIVEE) {
        throw new ConflictException(MESSAGE_FORMATION_ARCHIVEE);
      }
      const [{ statut }] = (await m.query(
        `SELECT statut::text AS statut FROM inscriptions WHERE id = $1`,
        [inscriptionId],
      )) as Array<{ statut: string }>;
      if (statut !== 'SUSPENDUE') throw new ConflictException(MESSAGE_PAS_SUSPENDUE);
      if ((await this.places(m, formation)) <= 0) {
        throw new ConflictException(MESSAGE_FORMATION_COMPLETE);
      }
      await m.query(
        `UPDATE inscriptions
            SET statut = 'EN_COURS', motif_suspension = NULL, date_suspension = NULL,
                suspendue_par = NULL, updated_at = now()
          WHERE id = $1 AND statut = 'SUSPENDUE'`,
        [inscriptionId],
      );
    });
    await this.auditService.record({
      action: 'INSCRIPTION_REACTIVEE',
      acteur: adminId,
      cible: inscriptionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        avant: 'SUSPENDUE',
        apres: 'EN_COURS',
        motifPrecedent: avant.motif_suspension,
      },
    });
    await this.notifierStatut(avant.apprenant_id, avant.formation_titre, false, null);
    return this.uneInscription(inscriptionId);
  }

  /**
   * Import CSV : une transaction, formation verrouillée, lignes traitées dans
   * l'ordre du fichier ; une ligne refusée n'empêche pas les suivantes.
   */
  async importer(
    adminId: string,
    formationId: string,
    tampon: Buffer,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<RapportImport> {
    let entrees: LigneImport[];
    try {
      entrees = lireFichier(tampon);
    } catch (erreur) {
      throw new BadRequestException(erreur instanceof Error ? erreur.message : String(erreur));
    }
    const { lignes, formation, inscrits } = await this.dataSource.transaction(async (m) => {
      const formation = await this.formation(m, formationId, true);
      if (formation.statut !== StatutFormation.OUVERTE) {
        throw new ConflictException(MESSAGE_FORMATION_NON_OUVERTE);
      }
      let places = await this.places(m, formation);
      const vus = new Set<string>();
      const lignes: LigneRapport[] = [];
      const inscrits: string[] = [];
      for (const e of entrees) {
        let resultat: ResultatLigne;
        if (vus.has(e.email)) {
          resultat = 'DOUBLON';
        } else {
          vus.add(e.email);
          const r = await this.inscrireLigne(m, formation, e.email, places);
          resultat = r.resultat;
          if (resultat === 'INSCRIT') {
            places -= 1;
            inscrits.push(r.apprenantId as string);
          }
        }
        lignes.push({
          ligne: e.ligne,
          email: e.email,
          resultat,
          libelle: LIBELLES_RESULTAT[resultat],
        });
      }
      return { lignes, formation, inscrits };
    });
    const rapport: RapportImport = { total: lignes.length, bilan: bilan(lignes), lignes };
    await this.auditService.record({
      action: 'INSCRIPTIONS_IMPORTEES',
      acteur: adminId,
      cible: formationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { total: rapport.total, bilan: rapport.bilan },
    });
    for (const apprenantId of inscrits) await this.bienvenue(apprenantId, formation);
    return rapport;
  }

  /**
   * Inscrit UNE adresse (formation déjà verrouillée par l'appelant) et dit
   * pourquoi si ce n'est pas possible. Aucune exception : l'import continue.
   */
  private async inscrireLigne(
    m: EntityManager,
    formation: Formation,
    email: string,
    places: number,
  ): Promise<{ resultat: ResultatLigne; inscriptionId?: string; apprenantId?: string }> {
    if (!emailValide(email)) return { resultat: 'EMAIL_INVALIDE' };
    const [u] = (await m.query(
      `SELECT id, role::text AS role, statut::text AS statut FROM users WHERE lower(email) = $1`,
      [email],
    )) as Array<{ id: string; role: string; statut: string }>;
    if (!u) return { resultat: 'COMPTE_INCONNU' };
    if (u.role !== 'APPRENANT') return { resultat: 'PAS_APPRENANT' };
    if (u.statut !== 'ACTIF') return { resultat: 'COMPTE_INACTIF' };
    const [existante] = (await m.query(
      `SELECT statut::text AS statut FROM inscriptions WHERE apprenant_id = $1 AND formation_id = $2`,
      [u.id, formation.id],
    )) as Array<{ statut: string }>;
    if (existante?.statut === 'SUSPENDUE') return { resultat: 'INSCRIPTION_SUSPENDUE' };
    if (existante) return { resultat: 'DEJA_INSCRIT' };
    if (places <= 0) return { resultat: 'COMPLET' };
    const [i] = (await m.query(
      `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_echeance)
       VALUES ($1, $2, 'EN_COURS', $3) RETURNING id`,
      [u.id, formation.id, formation.date_fin],
    )) as Array<{ id: string }>;
    return { resultat: 'INSCRIT', inscriptionId: i.id, apprenantId: u.id };
  }

  private erreurLigne(r: ResultatLigne): Error {
    switch (r) {
      case 'EMAIL_INVALIDE':
        return new BadRequestException(LIBELLES_RESULTAT[r] + '.');
      case 'COMPTE_INCONNU':
        return new NotFoundException(LIBELLES_RESULTAT[r] + '.');
      case 'COMPLET':
        return new ConflictException(MESSAGE_FORMATION_COMPLETE);
      default:
        return new ConflictException(LIBELLES_RESULTAT[r] + '.');
    }
  }

  /** Places restantes : capacité - inscriptions non suspendues. */
  private async places(m: EntityManager, f: Formation): Promise<number> {
    const [{ n }] = (await m.query(
      `SELECT count(*)::int AS n FROM inscriptions WHERE formation_id = $1 AND statut <> 'SUSPENDUE'`,
      [f.id],
    )) as Array<{ n: number }>;
    return f.capacite_max - n;
  }

  private async formation(m: EntityManager, id: string, verrou: boolean): Promise<Formation> {
    const [f] = (await m.query(
      `SELECT id, titre, statut::text AS statut, capacite_max, date_debut::text AS date_debut,
              date_fin::text AS date_fin
         FROM formations WHERE id = $1 ${verrou ? 'FOR UPDATE' : ''}`,
      [id],
    )) as Formation[];
    if (!f) throw new NotFoundException('Formation introuvable.');
    return f;
  }

  private async ligneInscription(id: string): Promise<{
    statut: string;
    apprenant_id: string;
    formation_id: string;
    formation_titre: string;
    formation_statut: string;
    motif_suspension: string | null;
  }> {
    const [l] = (await this.dataSource.query(
      `SELECT i.statut::text AS statut, i.apprenant_id, i.formation_id, f.titre AS formation_titre,
              f.statut::text AS formation_statut, i.motif_suspension
         FROM inscriptions i JOIN formations f ON f.id = i.formation_id WHERE i.id = $1`,
      [id],
    )) as Array<{
      statut: string;
      apprenant_id: string;
      formation_id: string;
      formation_titre: string;
      formation_statut: string;
      motif_suspension: string | null;
    }>;
    if (!l) throw new NotFoundException(MESSAGE_INSCRIPTION_INTROUVABLE);
    return l;
  }

  private async uneInscription(id: string): Promise<InscriptionAdminVue> {
    const [v] = (await this.dataSource.query(`${SELECT_INSCRIPTION} WHERE i.id = $1`, [
      id,
    ])) as InscriptionAdminVue[];
    return v;
  }

  private async bienvenue(apprenantId: string, f: Formation): Promise<void> {
    try {
      const [u] = (await this.dataSource.query(`SELECT email, prenom FROM users WHERE id = $1`, [
        apprenantId,
      ])) as Array<{ email: string; prenom: string | null }>;
      if (!u) return;
      await this.mailService.sendBienvenueInscriptionEmail(u.email, {
        prenom: u.prenom,
        titreFormation: f.titre,
        dateDebut: f.date_debut,
        dateFin: f.date_fin,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Email de bienvenue non envoyé (${apprenantId}) : ${detail}`);
    }
  }

  private async notifierStatut(
    apprenantId: string,
    titreFormation: string,
    suspendue: boolean,
    motif: string | null,
  ): Promise<void> {
    try {
      const [u] = (await this.dataSource.query(`SELECT email, prenom FROM users WHERE id = $1`, [
        apprenantId,
      ])) as Array<{ email: string; prenom: string | null }>;
      if (!u) return;
      await this.mailService.sendStatutInscriptionEmail(u.email, {
        prenom: u.prenom,
        titreFormation,
        suspendue,
        motif,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Email de statut d’inscription non envoyé (${apprenantId}) : ${detail}`);
    }
  }
}

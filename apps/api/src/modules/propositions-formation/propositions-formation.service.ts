import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { PropositionFormationDto } from './propositions-formation.dto';
import {
  MESSAGE_COMMENTAIRE,
  MESSAGE_DEJA_TRAITEE,
  MESSAGE_FORMATEUR_INACTIF,
  MESSAGE_MOTIF,
  MESSAGE_NON_MODIFIABLE,
  MESSAGE_TROP_DE_PROPOSITIONS,
  NOTE_MIN_PAR_DEFAUT,
  StatutProposition,
  creationPermise,
  decidable,
  descriptionFormation,
  modifiableParLeFormateur,
  texteValide,
} from './propositions-formation.regles';

interface Contexte {
  adresseIp: string | null;
}

/** Vue d'une proposition pour son auteur (US-FORM-08). */
export interface PropositionVue {
  id: string;
  titre: string;
  description: string | null;
  objectifs: string | null;
  dureeHeures: number | null;
  capaciteMax: number;
  publicVise: string | null;
  motif: string;
  statut: StatutProposition;
  commentaireAdmin: string | null;
  formationId: string | null;
  version: number;
  traiteLe: Date | null;
  creeLe: Date;
  modifieLe: Date;
}

export interface PropositionAdminVue extends PropositionVue {
  formateur: { id: string; email: string; prenom: string | null; nom: string | null };
  traitePar: string | null;
}

export interface PropositionPage {
  items: PropositionAdminVue[];
  total: number;
  page: number;
  limit: number;
}

interface Ligne {
  id: string;
  formateur_id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
  titre: string;
  description: string | null;
  objectifs: string | null;
  duree_heures: number | null;
  capacite_max: number;
  public_vise: string | null;
  motif: string;
  statut: StatutProposition;
  commentaire_admin: string | null;
  formation_id: string | null;
  version: number;
  traite_par: string | null;
  traite_le: Date | null;
  cree_le: Date;
  modifie_le: Date;
}

const SELECT_PROPOSITION = `
  SELECT p.*, u.email, u.prenom, u.nom
    FROM propositions_formation p
    JOIN users u ON u.id = p.formateur_id`;

const optionnel = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

type Decision = 'ACCEPTEE' | 'A_MODIFIER' | 'REFUSEE';

const ACTION_DECISION: Record<Decision, string> = {
  ACCEPTEE: 'PROPOSITION_FORMATION_ACCEPTEE',
  A_MODIFIER: 'PROPOSITION_FORMATION_A_MODIFIER',
  REFUSEE: 'PROPOSITION_FORMATION_REFUSEE',
};

/**
 * US-FORM-08 — Un formateur propose une nouvelle formation (plusieurs
 * possibles, au plus 5 ouvertes à la fois) ; l'administrateur l'accepte (une
 * formation BROUILLON est créée avec le proposant affecté, en une
 * transaction), demande des modifications (commentaire ; le formateur modifie
 * et resoumet) ou la refuse (motif). Emails et audit comme US-FORM-07.
 *
 * Concurrence : création sous verrou de la ligne du formateur (la limite de 5
 * tient face à des envois simultanés) ; toute décision et toute modification
 * verrouillent la proposition (FOR UPDATE) : une seule l'emporte.
 */
@Injectable()
export class PropositionsFormationService {
  private readonly logger = new Logger(PropositionsFormationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  // ----------------------------------------------------------------- formateur

  async creer(
    formateurId: string,
    dto: PropositionFormationDto,
    contexte: Contexte,
  ): Promise<PropositionVue> {
    if (!texteValide(dto.motif)) throw new BadRequestException(MESSAGE_MOTIF);
    const id = await this.transaction(async (qr) => {
      await qr.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [formateurId]);
      const [{ n }] = (await qr.query(
        `SELECT count(*)::int AS n FROM propositions_formation
          WHERE formateur_id = $1 AND statut IN ('EN_ATTENTE', 'A_MODIFIER')`,
        [formateurId],
      )) as Array<{ n: number }>;
      if (!creationPermise(n)) throw new ConflictException(MESSAGE_TROP_DE_PROPOSITIONS);
      const [cree] = (await qr.query(
        `INSERT INTO propositions_formation
           (formateur_id, titre, description, objectifs, duree_heures, capacite_max, public_vise, motif)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [formateurId, ...this.champs(dto)],
      )) as Array<{ id: string }>;
      return cree.id;
    });
    await this.auditService.record({
      action: 'PROPOSITION_FORMATION_CREEE',
      acteur: formateurId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { titre: dto.titre },
    });
    return this.vue(await this.charger(id));
  }

  async mesPropositions(formateurId: string): Promise<PropositionVue[]> {
    const lignes = (await this.dataSource.query(
      `${SELECT_PROPOSITION} WHERE p.formateur_id = $1 ORDER BY p.cree_le DESC, p.id`,
      [formateurId],
    )) as Ligne[];
    return lignes.map((l) => this.vue(l));
  }

  /** Modifier une proposition ouverte : elle repart EN_ATTENTE (version + 1). */
  async modifier(
    formateurId: string,
    id: string,
    dto: PropositionFormationDto,
    contexte: Contexte,
  ): Promise<PropositionVue> {
    if (!texteValide(dto.motif)) throw new BadRequestException(MESSAGE_MOTIF);
    const avant = await this.transaction(async (qr) => {
      const [p] = (await qr.query(
        `SELECT formateur_id, statut, version FROM propositions_formation WHERE id = $1 FOR UPDATE`,
        [id],
      )) as Array<{ formateur_id: string; statut: string; version: number }>;
      if (!p || p.formateur_id !== formateurId) throw new NotFoundException('Proposition introuvable.');
      if (!modifiableParLeFormateur(p.statut)) throw new ConflictException(MESSAGE_NON_MODIFIABLE);
      await qr.query(
        `UPDATE propositions_formation
            SET titre = $2, description = $3, objectifs = $4, duree_heures = $5, capacite_max = $6,
                public_vise = $7, motif = $8, statut = 'EN_ATTENTE', version = version + 1,
                modifie_le = now()
          WHERE id = $1`,
        [id, ...this.champs(dto)],
      );
      return p;
    });
    await this.auditService.record({
      action: 'PROPOSITION_FORMATION_RESOUMISE',
      acteur: formateurId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { statutAvant: avant.statut, version: avant.version + 1 },
    });
    return this.vue(await this.charger(id));
  }

  // ------------------------------------------------------------ administrateur

  async lister(filtre: {
    statut?: StatutProposition;
    page?: number;
    limit?: number;
  }): Promise<PropositionPage> {
    const page = filtre.page ?? 1;
    const limit = filtre.limit ?? 50;
    const parametres: unknown[] = [limit, (page - 1) * limit];
    if (filtre.statut) parametres.push(filtre.statut);
    const [lignes, [{ total }]] = await Promise.all([
      this.dataSource.query(
        `${SELECT_PROPOSITION} ${filtre.statut ? 'WHERE p.statut = $3' : ''}
          ORDER BY p.modifie_le DESC, p.id LIMIT $1 OFFSET $2`,
        parametres,
      ) as Promise<Ligne[]>,
      this.dataSource.query(
        `SELECT count(*)::int AS total FROM propositions_formation p
          ${filtre.statut ? 'WHERE p.statut = $1' : ''}`,
        filtre.statut ? [filtre.statut] : [],
      ) as Promise<Array<{ total: number }>>,
    ]);
    return { items: lignes.map((l) => this.vueAdmin(l)), total, page, limit };
  }

  async accepter(adminId: string, id: string, contexte: Contexte): Promise<PropositionAdminVue> {
    const formationId = await this.transaction(async (qr) => {
      const p = await this.verrouillerDecidable(qr, id);
      const [formateur] = (await qr.query(
        `SELECT role::text AS role, statut::text AS statut FROM users WHERE id = $1`,
        [p.formateur_id],
      )) as Array<{ role: string; statut: string }>;
      if (formateur.role !== 'FORMATEUR' || formateur.statut !== 'ACTIF') {
        throw new ConflictException(MESSAGE_FORMATEUR_INACTIF);
      }
      const [formation] = (await qr.query(
        `INSERT INTO formations
           (titre, description, objectifs, duree_heures, capacite_max, statut, note_min_certification)
         VALUES ($1, $2, $3, $4, $5, 'BROUILLON', $6) RETURNING id`,
        [
          p.titre,
          descriptionFormation(p.description, p.public_vise),
          p.objectifs,
          p.duree_heures,
          p.capacite_max,
          NOTE_MIN_PAR_DEFAUT,
        ],
      )) as Array<{ id: string }>;
      await qr.query(
        `INSERT INTO formation_formateurs (formation_id, formateur_id, affecte_par) VALUES ($1, $2, $3)`,
        [formation.id, p.formateur_id, adminId],
      );
      await qr.query(
        `UPDATE propositions_formation
            SET statut = 'ACCEPTEE', formation_id = $2, commentaire_admin = NULL,
                traite_par = $3, traite_le = now()
          WHERE id = $1`,
        [id, formation.id, adminId],
      );
      return formation.id;
    });
    return this.apresDecision(adminId, id, 'ACCEPTEE', contexte, { formationId });
  }

  async demanderModifications(
    adminId: string,
    id: string,
    commentaire: string,
    contexte: Contexte,
  ): Promise<PropositionAdminVue> {
    return this.decisionAvecCommentaire(adminId, id, 'A_MODIFIER', commentaire, contexte);
  }

  async refuser(
    adminId: string,
    id: string,
    motif: string,
    contexte: Contexte,
  ): Promise<PropositionAdminVue> {
    return this.decisionAvecCommentaire(adminId, id, 'REFUSEE', motif, contexte);
  }

  // ------------------------------------------------------------------- interne

  private async decisionAvecCommentaire(
    adminId: string,
    id: string,
    decision: 'A_MODIFIER' | 'REFUSEE',
    texte: string,
    contexte: Contexte,
  ): Promise<PropositionAdminVue> {
    if (!texteValide(texte)) {
      throw new BadRequestException(decision === 'REFUSEE' ? MESSAGE_MOTIF : MESSAGE_COMMENTAIRE);
    }
    await this.transaction(async (qr) => {
      await this.verrouillerDecidable(qr, id);
      await qr.query(
        `UPDATE propositions_formation
            SET statut = $2, commentaire_admin = $3, traite_par = $4, traite_le = now()
          WHERE id = $1`,
        [id, decision, texte.trim(), adminId],
      );
    });
    return this.apresDecision(adminId, id, decision, contexte, {});
  }

  private async verrouillerDecidable(qr: QueryRunner, id: string): Promise<Ligne> {
    const [p] = (await qr.query(`SELECT * FROM propositions_formation WHERE id = $1 FOR UPDATE`, [
      id,
    ])) as Ligne[];
    if (!p) throw new NotFoundException('Proposition introuvable.');
    if (!decidable(p.statut)) throw new ConflictException(MESSAGE_DEJA_TRAITEE);
    return p;
  }

  private async apresDecision(
    adminId: string,
    id: string,
    decision: Decision,
    contexte: Contexte,
    details: Record<string, unknown>,
  ): Promise<PropositionAdminVue> {
    const p = await this.charger(id);
    let notificationEnvoyee = true;
    try {
      await this.mailService.sendDecisionPropositionEmail(p.email, {
        prenom: p.prenom,
        titre: p.titre,
        decision,
        commentaire: p.commentaire_admin,
        formationId: p.formation_id,
      });
    } catch (erreur) {
      notificationEnvoyee = false;
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Email de décision non envoyé (proposition ${id}) : ${detail}`);
    }
    await this.auditService.record({
      action: ACTION_DECISION[decision],
      acteur: adminId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { formateurId: p.formateur_id, ...details, notificationEnvoyee },
    });
    return this.vueAdmin(p);
  }

  private champs(dto: PropositionFormationDto): unknown[] {
    return [
      dto.titre.trim(),
      optionnel(dto.description),
      optionnel(dto.objectifs),
      dto.dureeHeures ?? null,
      dto.capaciteMax,
      optionnel(dto.publicVise),
      dto.motif.trim(),
    ];
  }

  private async charger(id: string): Promise<Ligne> {
    const [ligne] = (await this.dataSource.query(`${SELECT_PROPOSITION} WHERE p.id = $1`, [
      id,
    ])) as Ligne[];
    if (!ligne) throw new NotFoundException('Proposition introuvable.');
    return ligne;
  }

  private vue(l: Ligne): PropositionVue {
    return {
      id: l.id,
      titre: l.titre,
      description: l.description,
      objectifs: l.objectifs,
      dureeHeures: l.duree_heures,
      capaciteMax: l.capacite_max,
      publicVise: l.public_vise,
      motif: l.motif,
      statut: l.statut,
      commentaireAdmin: l.commentaire_admin,
      formationId: l.formation_id,
      version: l.version,
      traiteLe: l.traite_le,
      creeLe: l.cree_le,
      modifieLe: l.modifie_le,
    };
  }

  private vueAdmin(l: Ligne): PropositionAdminVue {
    return {
      ...this.vue(l),
      formateur: { id: l.formateur_id, email: l.email, prenom: l.prenom, nom: l.nom },
      traitePar: l.traite_par,
    };
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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CritereAlerte } from '../../database/enums/critere-alerte.enum';
import { StatutAlerte } from '../../database/enums/statut-alerte.enum';
import { TypeActionAlerte } from '../../database/enums/type-action-alerte.enum';
import { AuditService } from '../audit/audit.service';
import { AlerteVue } from './alertes-decrochage.service';

export const MESSAGE_ALERTE_INTROUVABLE = 'Alerte introuvable.';
export const MESSAGE_DEJA_TRAITEE = 'Cette alerte est déjà traitée.';
export const MESSAGE_DEJA_OUVERTE = 'Cette alerte est déjà ouverte.';
export const MESSAGE_OUVERTE_EXISTANTE =
  'Une alerte ouverte existe déjà pour cet apprenant et ce critère : traitez-la plutôt.';

/** Une entrée de l'historique d'une alerte. */
export interface ActionAlerteVue {
  id: string;
  type: TypeActionAlerte;
  commentaire: string;
  date: Date;
  auteur: { id: string; prenom: string | null; nom: string | null; email: string } | null;
}

/** US-SUIVI-03 — Une alerte avec son historique. */
export interface AlerteDetail extends AlerteVue {
  historique: ActionAlerteVue[];
}

/**
 * US-SUIVI-03 — Traiter une alerte de décrochage (DS-14 P2).
 *
 * - « Traiter » : l'action menée est ajoutée à l'historique et l'alerte passe
 *   OUVERTE -> TRAITEE ; « Rouvrir » : le motif est ajouté et l'alerte repasse
 *   TRAITEE -> OUVERTE. L'historique n'est JAMAIS écrasé (ajout seul, garanti
 *   aussi par un déclencheur).
 * - Transition conditionnelle (`UPDATE … WHERE statut = …`) dans une
 *   transaction avec l'ajout à l'historique : deux traitements simultanés ->
 *   un seul réussit, l'autre reçoit 409 ; jamais deux entrées pour un
 *   traitement.
 * - Rouvrir est refusé (409) si une autre alerte OUVERTE existe déjà pour le
 *   même apprenant et le même critère (index unique partiel).
 * - Audit `ALERTE_TRAITEE` / `ALERTE_ROUVERTE` (acteur, cible = alerte).
 * - L'autorisation (formateur affecté ou administrateur) est faite par le
 *   garde `@FormateurDeLaFormation({ alerteId })`.
 */
@Injectable()
export class TraitementAlertesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async detail(alerteId: string): Promise<AlerteDetail> {
    const [l] = (await this.dataSource.query(
      `SELECT a.id, a.critere::text AS critere, a.statut::text AS statut, a.donnees, a.suggestion,
              a.date_creation, a.date_traitement, f.id AS formation_id, f.titre,
              u.id AS apprenant_id, u.prenom, u.nom, u.email
         FROM alertes_decrochage a
         JOIN formations f ON f.id = a.formation_id
         JOIN users u ON u.id = a.apprenant_id
        WHERE a.id = $1`,
      [alerteId],
    )) as Array<{
      id: string;
      critere: CritereAlerte;
      statut: StatutAlerte;
      donnees: Record<string, unknown>;
      suggestion: string;
      date_creation: Date;
      date_traitement: Date | null;
      formation_id: string;
      titre: string;
      apprenant_id: string;
      prenom: string | null;
      nom: string | null;
      email: string;
    }>;
    if (!l) throw new NotFoundException(MESSAGE_ALERTE_INTROUVABLE);
    const actions = (await this.dataSource.query(
      `SELECT x.id, x.type::text AS type, x.commentaire, x.date_action,
              u.id AS auteur_id, u.prenom, u.nom, u.email
         FROM actions_alerte x LEFT JOIN users u ON u.id = x.auteur_id
        WHERE x.alerte_id = $1
        ORDER BY x.date_action, x.id`,
      [alerteId],
    )) as Array<{
      id: string;
      type: TypeActionAlerte;
      commentaire: string;
      date_action: Date;
      auteur_id: string | null;
      prenom: string | null;
      nom: string | null;
      email: string | null;
    }>;
    return {
      id: l.id,
      critere: l.critere,
      statut: l.statut,
      donnees: l.donnees,
      suggestion: l.suggestion,
      dateCreation: l.date_creation,
      dateTraitement: l.date_traitement,
      formation: { id: l.formation_id, titre: l.titre },
      apprenant: { id: l.apprenant_id, prenom: l.prenom, nom: l.nom, email: l.email },
      historique: actions.map((x) => ({
        id: x.id,
        type: x.type,
        commentaire: x.commentaire,
        date: x.date_action,
        auteur: x.auteur_id
          ? { id: x.auteur_id, prenom: x.prenom, nom: x.nom, email: x.email as string }
          : null,
      })),
    };
  }

  /** OUVERTE -> TRAITEE, avec l'action menée. */
  async traiter(
    acteurId: string,
    alerteId: string,
    action: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<AlerteDetail> {
    await this.dataSource.transaction(async (m) => {
      const lignes = await this.modifier(
        m,
        `UPDATE alertes_decrochage
            SET statut = 'TRAITEE', date_traitement = now(), traite_par = $2
          WHERE id = $1 AND statut = 'OUVERTE'
        RETURNING id`,
        [alerteId, acteurId],
      );
      if (lignes === 0) await this.refuser(m, alerteId, MESSAGE_DEJA_TRAITEE);
      await this.historiser(m, alerteId, acteurId, TypeActionAlerte.TRAITEMENT, action);
    });
    await this.auditService.record({
      action: 'ALERTE_TRAITEE',
      acteur: acteurId,
      cible: alerteId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant: StatutAlerte.OUVERTE, apres: StatutAlerte.TRAITEE },
    });
    return this.detail(alerteId);
  }

  /** TRAITEE -> OUVERTE, avec le motif. */
  async rouvrir(
    acteurId: string,
    alerteId: string,
    motif: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<AlerteDetail> {
    try {
      await this.dataSource.transaction(async (m) => {
        const lignes = await this.modifier(
          m,
          `UPDATE alertes_decrochage
              SET statut = 'OUVERTE', date_traitement = NULL, traite_par = NULL
            WHERE id = $1 AND statut = 'TRAITEE'
          RETURNING id`,
          [alerteId],
        );
        if (lignes === 0) await this.refuser(m, alerteId, MESSAGE_DEJA_OUVERTE);
        await this.historiser(m, alerteId, acteurId, TypeActionAlerte.REOUVERTURE, motif);
      });
    } catch (erreur) {
      if ((erreur as { code?: string }).code === '23505') {
        throw new ConflictException(MESSAGE_OUVERTE_EXISTANTE);
      }
      throw erreur;
    }
    await this.auditService.record({
      action: 'ALERTE_ROUVERTE',
      acteur: acteurId,
      cible: alerteId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { avant: StatutAlerte.TRAITEE, apres: StatutAlerte.OUVERTE },
    });
    return this.detail(alerteId);
  }

  /** Nombre de lignes modifiées par un UPDATE … RETURNING. */
  private async modifier(m: EntityManager, sql: string, params: unknown[]): Promise<number> {
    const r = (await m.query(sql, params)) as [unknown[], number] | unknown[];
    // Le pilote PostgreSQL de TypeORM renvoie [lignes, nombre] pour un UPDATE.
    return Array.isArray(r[0]) ? (r[0] as unknown[]).length : r.length;
  }

  /** 404 si l'alerte n'existe pas, 409 sinon (état incompatible). */
  private async refuser(m: EntityManager, alerteId: string, message: string): Promise<never> {
    const [existe] = (await m.query(`SELECT 1 FROM alertes_decrochage WHERE id = $1`, [
      alerteId,
    ])) as unknown[];
    if (!existe) throw new NotFoundException(MESSAGE_ALERTE_INTROUVABLE);
    throw new ConflictException(message);
  }

  private async historiser(
    m: EntityManager,
    alerteId: string,
    auteurId: string,
    type: TypeActionAlerte,
    commentaire: string,
  ): Promise<void> {
    await m.query(
      `INSERT INTO actions_alerte (alerte_id, auteur_id, type, commentaire)
       VALUES ($1, $2, $3::actions_alerte_type_enum, $4)`,
      [alerteId, auteurId, type, commentaire],
    );
  }
}

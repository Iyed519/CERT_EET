import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { AuditService } from '../audit/audit.service';
import {
  ACTION_AUDIT,
  EvaluationsEnCours,
  MESSAGE_CONFIRMATION_REQUISE,
  TRANSITIONS,
  confirmationRequise,
  messageTransitionRefusee,
  transitionAutorisee,
} from './cycle-formation.regles';
import { FormationVue, versFormationVue } from './formations.service';

/** US-FORM-02 — Ce que l'administrateur voit avant de changer le statut. */
export interface ImpactCycle {
  statut: StatutFormation;
  transitionsPossibles: StatutFormation[];
  inscriptionsEnCours: number;
  evaluationsEnCours: EvaluationsEnCours;
  certificatsActifs: number;
}

/**
 * US-FORM-02 — Clôturer, archiver ou rouvrir une formation (DS-16 P1).
 *
 * - Transitions : OUVERTE -> FERMEE -> ARCHIVEE, FERMEE -> OUVERTE ;
 *   ARCHIVEE est définitif (409).
 * - Évaluations en cours (tentative EN_COURS, livrable à corriger,
 *   correction ouverte, certificat en émission) : clôturer ou archiver exige
 *   `confirmer: true`, sinon 409 `CONFIRMATION_REQUISE` avec le détail.
 * - `UPDATE … WHERE statut = attendu` : deux changements simultanés -> un
 *   seul réussit, l'autre reçoit 409 ; une seule trace.
 * - Audit FORMATION_CLOTUREE / FORMATION_ARCHIVEE / FORMATION_ROUVERTE
 *   (avant, après, évaluations en cours, confirmation).
 * - Les certificats émis ne sont pas touchés : ils restent vérifiables.
 */
@Injectable()
export class CycleFormationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async impact(formationId: string): Promise<ImpactCycle> {
    const statut = await this.statut(formationId);
    const [c] = (await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM inscriptions WHERE formation_id = $1 AND statut = 'EN_COURS')
           AS inscriptions,
         (SELECT count(*)::int FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
            JOIN modules m ON m.id = q.module_id
           WHERE m.formation_id = $1 AND t.statut = 'EN_COURS') AS tentatives,
         (SELECT count(*)::int FROM livrables l JOIN ateliers a ON a.id = l.atelier_id
            JOIN modules m ON m.id = a.module_id
           WHERE m.formation_id = $1 AND l.statut = 'SOUMIS') AS livrables,
         (SELECT count(*)::int FROM corrections co JOIN livrables l ON l.id = co.livrable_id
            JOIN ateliers a ON a.id = l.atelier_id JOIN modules m ON m.id = a.module_id
           WHERE m.formation_id = $1 AND co.statut = 'EN_COURS') AS corrections,
         (SELECT count(*)::int FROM certificats
           WHERE formation_id = $1 AND statut IN ('EN_ATTENTE_GENERATION', 'EN_GENERATION'))
           AS emission,
         (SELECT count(*)::int FROM certificats WHERE formation_id = $1 AND statut = 'ACTIF')
           AS actifs`,
      [formationId],
    )) as Array<{
      inscriptions: number;
      tentatives: number;
      livrables: number;
      corrections: number;
      emission: number;
      actifs: number;
    }>;
    return {
      statut,
      transitionsPossibles: TRANSITIONS[statut],
      inscriptionsEnCours: c.inscriptions,
      evaluationsEnCours: {
        tentativesEnCours: c.tentatives,
        livrablesACorriger: c.livrables,
        correctionsEnCours: c.corrections,
        certificatsEnEmission: c.emission,
      },
      certificatsActifs: c.actifs,
    };
  }

  async changerStatut(
    adminId: string,
    formationId: string,
    vers: StatutFormation,
    confirmer: boolean,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<FormationVue> {
    const impact = await this.impact(formationId);
    const de = impact.statut;
    if (!transitionAutorisee(de, vers)) {
      throw new ConflictException(messageTransitionRefusee(de, vers));
    }
    if (confirmationRequise(vers, impact.evaluationsEnCours) && !confirmer) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CONFIRMATION_REQUISE',
        message: MESSAGE_CONFIRMATION_REQUISE,
        evaluationsEnCours: impact.evaluationsEnCours,
      });
    }
    const [lignes] = (await this.dataSource.query(
      `UPDATE formations SET statut = $3::formations_statut_enum, updated_at = now()
        WHERE id = $1 AND statut = $2::formations_statut_enum
      RETURNING id`,
      [formationId, de, vers],
    )) as [unknown[], number];
    if (lignes.length === 0) {
      // Un autre changement est passé entre la lecture et l'écriture.
      const actuel = await this.statut(formationId);
      throw new ConflictException(messageTransitionRefusee(actuel, vers));
    }
    await this.auditService.record({
      action: ACTION_AUDIT[vers],
      acteur: adminId,
      cible: formationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        avant: de,
        apres: vers,
        evaluationsEnCours: impact.evaluationsEnCours,
        confirme: confirmer,
      },
    });
    const formation = await this.dataSource.manager.findOneOrFail(Formation, {
      where: { id: formationId },
    });
    return versFormationVue(formation);
  }

  private async statut(formationId: string): Promise<StatutFormation> {
    const [f] = (await this.dataSource.query(
      `SELECT statut::text AS statut FROM formations WHERE id = $1`,
      [formationId],
    )) as Array<{ statut: StatutFormation }>;
    if (!f) throw new NotFoundException('Formation introuvable.');
    return f.statut;
  }
}

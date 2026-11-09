import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { AuditService } from '../audit/audit.service';
import { CertificatsService } from './certificats.service';
import { EvaluationLue, Verdict, verdictEligibilite } from './eligibilite.regles';

/** D'où vient l'évaluation (tracé dans l'audit). */
export type OrigineEvaluation = 'CORRECTION_FINALISEE' | 'TENTATIVE_NOTEE' | 'ADMINISTRATEUR';

/** Résultat d'une évaluation suivie, le cas échéant, d'une demande d'émission. */
export interface ResultatDeclenchement extends Verdict {
  /** Identifiant du certificat (existant ou créé) si éligible. */
  certificatId: string | null;
  /** true seulement pour l'évaluation qui a CRÉÉ la demande. */
  declenche: boolean;
}

/**
 * Éligibilité à la certification et déclenchement (US-ATEL-09, DS-03 ->
 * DS-04, AC-03).
 *
 *  - `evaluer` lit l'état (formation, inscription, QCM publiés et meilleures
 *    tentatives notées, ateliers publiés et corrections finalisées) et rend le
 *    verdict des règles pures ;
 *  - `evaluerEtDeclencher` : si éligible, `CertificatsService.demanderEmission`
 *    — EXACTEMENT UNE FOIS par apprenant et formation, même si deux
 *    évaluations se croisent (contrainte UNIQUE + ON CONFLICT DO NOTHING) ;
 *    seule l'évaluation qui crée la demande trace CERTIFICATION_DECLENCHEE ;
 *  - `declencherSansEchec` : appelé après la finalisation d'une correction et
 *    la notation d'une tentative ; une erreur est journalisée, jamais renvoyée
 *    (la note est déjà acquise ; l'administrateur peut réévaluer).
 */
@Injectable()
export class EligibiliteService {
  private readonly logger = new Logger(EligibiliteService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly certificatsService: CertificatsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  async evaluer(apprenantId: string, formationId: string): Promise<Verdict> {
    const [formation] = (await this.dataSource.query(
      'SELECT statut, note_min_certification FROM formations WHERE id = $1',
      [formationId],
    )) as Array<{ statut: StatutFormation; note_min_certification: number }>;
    if (!formation) throw new NotFoundException('Formation introuvable.');
    const [inscription] = (await this.dataSource.query(
      'SELECT statut FROM inscriptions WHERE apprenant_id = $1 AND formation_id = $2',
      [apprenantId, formationId],
    )) as Array<{ statut: StatutInscription }>;

    const qcms = (await this.dataSource.query(
      `SELECT q.id, q.titre,
              max(t.score) FILTER (WHERE t.statut = 'NOTEE')::float8 AS score,
              coalesce(bool_or(t.est_reussie) FILTER (WHERE t.statut = 'NOTEE'), false) AS reussie
         FROM qcm q
         JOIN modules m ON m.id = q.module_id
         LEFT JOIN tentatives_qcm t ON t.qcm_id = q.id AND t.apprenant_id = $2
        WHERE m.formation_id = $1 AND q.statut = 'PUBLIE'
        GROUP BY q.id, q.titre, m.ordre
        ORDER BY m.ordre, q.titre`,
      [formationId, apprenantId],
    )) as Array<{ id: string; titre: string; score: number | null; reussie: boolean }>;
    const ateliers = (await this.dataSource.query(
      `SELECT a.id, a.titre, c.score_total::float8 AS score
         FROM ateliers a
         JOIN modules m ON m.id = a.module_id
         LEFT JOIN livrables l ON l.atelier_id = a.id AND l.apprenant_id = $2 AND l.statut = 'NOTE'
         LEFT JOIN corrections c ON c.livrable_id = l.id AND c.statut = 'TERMINEE'
        WHERE m.formation_id = $1 AND a.statut <> 'BROUILLON'
        ORDER BY m.ordre, a.date_limite, a.id`,
      [formationId, apprenantId],
    )) as Array<{ id: string; titre: string; score: number | null }>;

    const evaluations: EvaluationLue[] = [
      ...qcms.map((q) => ({
        type: 'QCM' as const,
        id: q.id,
        titre: q.titre,
        score: q.score === null ? null : Number(q.score),
        reussie: q.reussie,
      })),
      ...ateliers.map((a) => ({
        type: 'ATELIER' as const,
        id: a.id,
        titre: a.titre,
        score: a.score === null ? null : Number(a.score),
      })),
    ];
    return verdictEligibilite({
      statutFormation: formation.statut,
      statutInscription: inscription?.statut ?? null,
      seuilCertification: Number(formation.note_min_certification),
      evaluations,
    });
  }

  async evaluerEtDeclencher(
    apprenantId: string,
    formationId: string,
    origine: OrigineEvaluation,
    acteur: string | null = null,
  ): Promise<ResultatDeclenchement> {
    const verdict = await this.evaluer(apprenantId, formationId);
    if (!verdict.eligible || verdict.scoreFinal === null) {
      return { ...verdict, certificatId: null, declenche: false };
    }
    const demande = await this.certificatsService.demanderEmission(
      apprenantId,
      formationId,
      verdict.scoreFinal,
    );
    if (demande.cree) {
      await this.auditService.record({
        action: 'CERTIFICATION_DECLENCHEE',
        acteur,
        cible: demande.certificatId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          apprenantId,
          formationId,
          origine,
          scoreFinal: verdict.scoreFinal,
          evaluations: verdict.evaluations.map((e) => ({
            type: e.type,
            id: e.id,
            score: e.score,
          })),
        },
      });
    }
    return { ...verdict, certificatId: demande.certificatId, declenche: demande.cree };
  }

  /** Après une note : évalue et déclenche au mieux (jamais d'erreur renvoyée). */
  async declencherSansEchec(
    apprenantId: string,
    formationId: string,
    origine: OrigineEvaluation,
  ): Promise<void> {
    try {
      await this.evaluerEtDeclencher(apprenantId, formationId, origine);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(
        `Éligibilité non évaluée (apprenant ${apprenantId}, formation ${formationId}) : ${detail}`,
      );
    }
  }

  /**
   * Réévaluation par l'administrateur de TOUS les inscrits (EN_COURS ou
   * TERMINEE) d'une formation — par exemple pour des notes antérieures à
   * cette story. Rend le nombre d'inscrits évalués et de demandes créées.
   */
  async evaluerFormation(
    acteurId: string,
    formationId: string,
    contexte: { adresseIp: string | null },
  ): Promise<{ evalues: number; eligibles: number; declenches: number }> {
    const [formation] = (await this.dataSource.query('SELECT id FROM formations WHERE id = $1', [
      formationId,
    ])) as Array<{ id: string }>;
    if (!formation) throw new NotFoundException('Formation introuvable.');
    const inscrits = (await this.dataSource.query(
      `SELECT apprenant_id FROM inscriptions
        WHERE formation_id = $1 AND statut IN ('EN_COURS', 'TERMINEE')
        ORDER BY apprenant_id`,
      [formationId],
    )) as Array<{ apprenant_id: string }>;
    let eligibles = 0;
    let declenches = 0;
    for (const { apprenant_id: apprenantId } of inscrits) {
      const r = await this.evaluerEtDeclencher(
        apprenantId,
        formationId,
        'ADMINISTRATEUR',
        acteurId,
      );
      if (r.eligible) eligibles += 1;
      if (r.declenche) declenches += 1;
    }
    const bilan = { evalues: inscrits.length, eligibles, declenches };
    await this.auditService.record({
      action: 'CERTIFICATION_FORMATION_EVALUEE',
      acteur: acteurId,
      cible: formationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: bilan,
    });
    return bilan;
  }
}

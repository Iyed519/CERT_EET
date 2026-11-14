import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../../database/enums/role.enum';

/** Compteurs du menu latéral du formateur (US-UX-02). */
export interface CompteursFormateur {
  role: 'FORMATEUR';
  /** Alertes de décrochage OUVERTES + alertes de surveillance NOUVEAU (entrée « Alertes »). */
  alertes: number;
  alertesDecrochage: number;
  alertesSurveillance: number;
  /** Livrables SOUMIS ou EN_CORRECTION (même définition que le tableau de bord). */
  livrablesACorriger: number;
  /** Tentatives SOUMISE ou ABANDONNEE_TIMER, QCM non brouillon (même définition). */
  tentativesAEvaluer: number;
}

/** Compteurs du menu latéral de l'administrateur (US-UX-02). */
export interface CompteursAdministrateur {
  role: 'ADMINISTRATEUR';
  demandesRole: number;
  demandesAffectation: number;
  propositions: number;
}

export type CompteursNavigation = CompteursFormateur | CompteursAdministrateur;

/** Un atelier des formations du formateur, avec ses comptes de livrables. */
export interface AtelierAEvaluer {
  id: string;
  titre: string;
  statut: string;
  moduleTitre: string;
  formationId: string;
  formationTitre: string;
  aCorriger: number;
  enCorrection: number;
  notes: number;
}

/** Un QCM des formations du formateur, avec ses comptes de tentatives. */
export interface QcmAEvaluer {
  id: string;
  titre: string;
  statut: string;
  moduleTitre: string;
  formationId: string;
  formationTitre: string;
  tentatives: number;
  aEvaluer: number;
  alertesAExaminer: number;
}

export interface EvaluationsFormateur {
  ateliers: AtelierAEvaluer[];
  qcm: QcmAEvaluer[];
}

const MES_FORMATIONS = `SELECT formation_id FROM formation_formateurs WHERE formateur_id = $1`;

const n = (v: unknown): number => Number(v ?? 0);

/**
 * US-UX-02 — Lecture seule, non tracée (comme les tableaux de bord) :
 * - compteurs du menu latéral, une requête SQL par rôle ;
 * - pages d'ensemble « Livrables à corriger » et « Tentatives des QCM » du
 *   formateur : comptes agrégés par atelier et par QCM de SES formations
 *   affectées (deux requêtes, quel que soit leur nombre).
 * Les définitions reprennent celles du tableau de bord du formateur
 * (US-DASH-03), de l'administrateur (US-DASH-01) et de la surveillance
 * (US-QCM-15) : les chiffres concordent partout.
 */
@Injectable()
export class NavigationService {
  constructor(private readonly dataSource: DataSource) {}

  async compteurs(utilisateur: { id: string; role: Role }): Promise<CompteursNavigation> {
    if (utilisateur.role === Role.ADMINISTRATEUR) {
      const [l] = await this.q<Record<string, unknown>>(
        `SELECT (SELECT count(*) FROM demandes_role WHERE statut = 'EN_ATTENTE') AS role,
                (SELECT count(*) FROM demandes_affectation WHERE statut = 'EN_ATTENTE') AS affectation,
                (SELECT count(*) FROM propositions_formation WHERE statut = 'EN_ATTENTE') AS propositions`,
        [],
      );
      return {
        role: 'ADMINISTRATEUR',
        demandesRole: n(l.role),
        demandesAffectation: n(l.affectation),
        propositions: n(l.propositions),
      };
    }
    const [l] = await this.q<Record<string, unknown>>(
      `WITH mes AS (${MES_FORMATIONS})
       SELECT (SELECT count(*) FROM alertes_decrochage
                WHERE statut = 'OUVERTE' AND formation_id IN (SELECT formation_id FROM mes)) AS decrochage,
              (SELECT count(*) FROM evenements_surveillance e
                 JOIN tentatives_qcm t ON t.id = e.tentative_id
                 JOIN qcm q ON q.id = t.qcm_id
                 JOIN modules m ON m.id = q.module_id
                WHERE e.statut = 'NOUVEAU' AND m.formation_id IN (SELECT formation_id FROM mes)) AS surveillance,
              (SELECT count(*) FROM livrables l
                 JOIN ateliers a ON a.id = l.atelier_id
                 JOIN modules m ON m.id = a.module_id
                WHERE l.statut IN ('SOUMIS', 'EN_CORRECTION')
                  AND m.formation_id IN (SELECT formation_id FROM mes)) AS livrables,
              (SELECT count(*) FROM tentatives_qcm t
                 JOIN qcm q ON q.id = t.qcm_id AND q.statut <> 'BROUILLON'
                 JOIN modules m ON m.id = q.module_id
                WHERE t.statut IN ('SOUMISE', 'ABANDONNEE_TIMER')
                  AND m.formation_id IN (SELECT formation_id FROM mes)) AS tentatives`,
      [utilisateur.id],
    );
    const alertesDecrochage = n(l.decrochage);
    const alertesSurveillance = n(l.surveillance);
    return {
      role: 'FORMATEUR',
      alertes: alertesDecrochage + alertesSurveillance,
      alertesDecrochage,
      alertesSurveillance,
      livrablesACorriger: n(l.livrables),
      tentativesAEvaluer: n(l.tentatives),
    };
  }

  async evaluations(formateurId: string): Promise<EvaluationsFormateur> {
    const [ateliers, qcm] = await Promise.all([
      this.q<Record<string, unknown>>(
        `SELECT a.id, a.titre, a.statut::text AS statut, m.titre AS module_titre,
                f.id AS formation_id, f.titre AS formation_titre,
                count(l.id) FILTER (WHERE l.statut = 'SOUMIS') AS a_corriger,
                count(l.id) FILTER (WHERE l.statut = 'EN_CORRECTION') AS en_correction,
                count(l.id) FILTER (WHERE l.statut = 'NOTE') AS notes
           FROM ateliers a
           JOIN modules m ON m.id = a.module_id
           JOIN formations f ON f.id = m.formation_id
           LEFT JOIN livrables l ON l.atelier_id = a.id
          WHERE m.formation_id IN (${MES_FORMATIONS})
          GROUP BY a.id, m.id, f.id
          ORDER BY f.titre, m.ordre, a.titre, a.id`,
        [formateurId],
      ),
      this.q<Record<string, unknown>>(
        `SELECT q.id, q.titre, q.statut::text AS statut, m.titre AS module_titre,
                f.id AS formation_id, f.titre AS formation_titre,
                (SELECT count(*) FROM tentatives_qcm t WHERE t.qcm_id = q.id) AS tentatives,
                (SELECT count(*) FROM tentatives_qcm t
                  WHERE t.qcm_id = q.id AND t.statut IN ('SOUMISE', 'ABANDONNEE_TIMER')) AS a_evaluer,
                (SELECT count(*) FROM evenements_surveillance e
                   JOIN tentatives_qcm t ON t.id = e.tentative_id
                  WHERE t.qcm_id = q.id AND e.statut = 'NOUVEAU') AS alertes
           FROM qcm q
           JOIN modules m ON m.id = q.module_id
           JOIN formations f ON f.id = m.formation_id
          WHERE m.formation_id IN (${MES_FORMATIONS})
          ORDER BY f.titre, m.ordre, q.titre, q.id`,
        [formateurId],
      ),
    ]);
    return {
      ateliers: ateliers.map((a) => ({
        id: String(a.id),
        titre: String(a.titre),
        statut: String(a.statut),
        moduleTitre: String(a.module_titre),
        formationId: String(a.formation_id),
        formationTitre: String(a.formation_titre),
        aCorriger: n(a.a_corriger),
        enCorrection: n(a.en_correction),
        notes: n(a.notes),
      })),
      qcm: qcm.map((x) => ({
        id: String(x.id),
        titre: String(x.titre),
        statut: String(x.statut),
        moduleTitre: String(x.module_titre),
        formationId: String(x.formation_id),
        formationTitre: String(x.formation_titre),
        tentatives: n(x.tentatives),
        aEvaluer: n(x.a_evaluer),
        alertesAExaminer: n(x.alertes),
      })),
    };
  }

  private q<T>(sql: string, parametres: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, parametres) as Promise<T[]>;
  }
}

import { StatutFormation } from '../../database/enums/statut-formation.enum';

/**
 * US-FORM-02 — Règles PURES du cycle de vie d'une formation (DS-16 P1) :
 * OUVERTE -> FERMEE -> ARCHIVEE, réouverture FERMEE -> OUVERTE ; ARCHIVEE est
 * définitif.
 *
 *  - FERMEE : plus d'inscription (règle existante d'US-INSC-01) ; les inscrits
 *    terminent leur parcours (QCM, ateliers, certificats).
 *  - ARCHIVEE : parcours figé — plus de modification (US-FORM-01), plus de
 *    démarrage de QCM ni de dépôt de livrable, plus de demande de certificat ;
 *    les certificats émis restent vérifiables.
 */

/** Transitions autorisées depuis chaque statut. */
export const TRANSITIONS: Record<StatutFormation, StatutFormation[]> = {
  // US-FORM-08 : un brouillon (proposition acceptée) se publie.
  [StatutFormation.BROUILLON]: [StatutFormation.OUVERTE],
  [StatutFormation.OUVERTE]: [StatutFormation.FERMEE],
  [StatutFormation.FERMEE]: [StatutFormation.ARCHIVEE, StatutFormation.OUVERTE],
  [StatutFormation.ARCHIVEE]: [],
};

/** Action d'audit de chaque transition (selon le statut d'arrivée). */
export const ACTION_AUDIT: Record<StatutFormation, string> = {
  [StatutFormation.BROUILLON]: 'FORMATION_BROUILLON',
  [StatutFormation.FERMEE]: 'FORMATION_CLOTUREE',
  [StatutFormation.ARCHIVEE]: 'FORMATION_ARCHIVEE',
  [StatutFormation.OUVERTE]: 'FORMATION_ROUVERTE',
};

export const MESSAGE_ARCHIVEE_DEFINITIF = 'Une formation archivée ne peut plus changer de statut.';
export const MESSAGE_CONFIRMATION_REQUISE =
  'Des évaluations sont en cours dans cette formation : confirmez explicitement le changement de statut.';
export const MESSAGE_FORMATION_ARCHIVEE_PARCOURS =
  'Cette formation est archivée : son parcours est figé.';

/** Message d'une transition refusée (409). */
export function messageTransitionRefusee(de: StatutFormation, vers: StatutFormation): string {
  if (de === StatutFormation.ARCHIVEE) return MESSAGE_ARCHIVEE_DEFINITIF;
  if (de === vers) return `La formation est déjà ${libelle(vers)}.`;
  return `Transition impossible : une formation ${libelle(de)} ne peut pas devenir ${libelle(vers)}.`;
}

/** Action d'audit d'une transition : publier un brouillon n'est pas « rouvrir ». */
export function actionAudit(de: StatutFormation, vers: StatutFormation): string {
  if (de === StatutFormation.BROUILLON && vers === StatutFormation.OUVERTE) {
    return 'FORMATION_PUBLIEE';
  }
  return ACTION_AUDIT[vers];
}

export function transitionAutorisee(de: StatutFormation, vers: StatutFormation): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** Évaluations en cours dans une formation (ce que la confirmation protège). */
export interface EvaluationsEnCours {
  tentativesEnCours: number;
  livrablesACorriger: number;
  correctionsEnCours: number;
  certificatsEnEmission: number;
}

export function total(e: EvaluationsEnCours): number {
  return (
    e.tentativesEnCours + e.livrablesACorriger + e.correctionsEnCours + e.certificatsEnEmission
  );
}

/**
 * La confirmation est exigée pour CLÔTURER ou ARCHIVER une formation où des
 * évaluations sont en cours ; jamais pour la rouvrir.
 */
export function confirmationRequise(vers: StatutFormation, e: EvaluationsEnCours): boolean {
  return vers !== StatutFormation.OUVERTE && total(e) > 0;
}

function libelle(s: StatutFormation): string {
  if (s === StatutFormation.BROUILLON) return 'en brouillon';
  return s === StatutFormation.OUVERTE
    ? 'ouverte'
    : s === StatutFormation.FERMEE
      ? 'fermée'
      : 'archivée';
}

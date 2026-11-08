/**
 * Cycle de vie d'un livrable (diagramme d'états *Livrable*, DS-03).
 *
 * SOUMIS (déposé par l'apprenant, US-ATEL-04) -> EN_CORRECTION (ouvert par le
 * formateur, verrouillé pour l'apprenant, US-ATEL-06) -> NOTE (feedback
 * immuable, US-ATEL-07). Les trois valeurs sont déclarées dès maintenant pour
 * ne pas avoir à modifier le type PostgreSQL ensuite. Pas de BROUILLON : le
 * dépôt est atomique (rien n'est enregistré tant qu'il n'est pas complet).
 */
export enum StatutLivrable {
  SOUMIS = 'SOUMIS',
  EN_CORRECTION = 'EN_CORRECTION',
  NOTE = 'NOTE',
}

/**
 * Statut d'une correction (US-ATEL-06, DS-03 partie 2).
 *
 * EN_COURS : ouverte par un formateur (le livrable est EN_CORRECTION), les
 * critères se notent et se renotent (brouillon). TERMINEE : finalisée
 * (US-ATEL-07) — note et feedback immuables, livrable NOTE. Les deux valeurs
 * sont déclarées dès maintenant pour ne pas modifier le type PostgreSQL ensuite.
 */
export enum StatutCorrection {
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE',
}

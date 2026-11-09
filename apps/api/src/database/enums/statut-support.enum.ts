/**
 * Statut d'un support pédagogique déposé pour l'assistance IA (US-IA-01,
 * DS-06 partie 1, AC-04 : « EnIndexation -> Indexé »).
 *
 *  - EN_INDEXATION : dépôt accepté, travail d'indexation en file ou en cours ;
 *  - INDEXE : texte extrait, découpé, vectorisé et stocké (pgvector) — seul
 *    état utilisable comme source d'une génération (US-IA-02) ;
 *  - ECHEC_INDEXATION : fichier illisible, sans texte exploitable ou
 *    tentatives épuisées (critère d'erreur du Backlog : « le support n'est pas
 *    marqué Indexé ») ; le formateur peut relancer l'indexation.
 */
export enum StatutSupport {
  EN_INDEXATION = 'EN_INDEXATION',
  INDEXE = 'INDEXE',
  ECHEC_INDEXATION = 'ECHEC_INDEXATION',
}

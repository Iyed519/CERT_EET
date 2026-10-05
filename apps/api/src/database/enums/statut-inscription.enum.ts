/**
 * État d'une inscription apprenant <-> formation (DS-08, DS-11).
 *
 * Valeurs reprises du diagramme de classes (« EnCours | Terminée |
 * Suspendue »). SUSPENDUE remplace toute suppression : une désinscription ou
 * un retrait administratif suspend l'inscription pour conserver la
 * traçabilité (DS-11), et retire l'accès aux modules (US-INSC-04).
 */
export enum StatutInscription {
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE',
  SUSPENDUE = 'SUSPENDUE',
}

/**
 * Statut d'une génération de questions par IA (US-IA-02, DS-06 partie 2 :
 * « EnCours » puis « Terminée »).
 *
 *  - EN_COURS : génération lancée, travail en file ou en cours (US-IA-03) ;
 *  - TERMINEE : suggestions produites (à réviser, US-IA-04) ;
 *  - ECHEC : appel au modèle impossible ou réponse inexploitable après les
 *    reprises (motif enregistré).
 */
export enum StatutGeneration {
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE',
  ECHEC = 'ECHEC',
}

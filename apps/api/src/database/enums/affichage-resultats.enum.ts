/**
 * Mode d'affichage du résultat d'un QCM (DS-02 étape 5, US-QCM-09).
 *
 * IMMEDIAT : score + bonnes réponses + explications dès la soumission.
 * DIFFERE  : score seul ; les corrections ne sont révélées qu'après la
 *            fermeture de la fenêtre d'examen (pas de fuite entre apprenants).
 */
export enum AffichageResultats {
  IMMEDIAT = 'IMMEDIAT',
  DIFFERE = 'DIFFERE',
}

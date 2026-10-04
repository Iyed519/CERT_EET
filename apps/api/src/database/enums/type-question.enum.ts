/**
 * Typologie des questions (énumération `TypeQuestion` du diagramme de classes).
 *
 * Je reprends les cinq valeurs du diagramme pour ne pas avoir à modifier le
 * type PostgreSQL plus tard. Le Sprint 2 ne traite que QCM (plusieurs bonnes
 * réponses), QCU (exactement une) et VRAI_FAUX (DS-12) : les services
 * refuseront REPONSE_COURTE et ASSOCIATION tant que leur correction n'est pas
 * implémentée.
 */
export enum TypeQuestion {
  QCM = 'QCM',
  QCU = 'QCU',
  VRAI_FAUX = 'VRAI_FAUX',
  REPONSE_COURTE = 'REPONSE_COURTE',
  ASSOCIATION = 'ASSOCIATION',
}

/**
 * US-SUIVI-02 — Critère factuel d'une alerte de décrochage (DS-14 P2).
 *  - INACTIVITE : inscription en cours, aucune connexion depuis plus de 7 jours ;
 *  - ECHECS_QCM : les deux dernières tentatives notées sont des échecs ;
 *  - LIVRABLE_EN_RETARD : atelier publié non rendu 48 h après la date limite ;
 *  - SCORE_EN_CHUTE : dernière note inférieure de 20 points ou plus à la
 *    moyenne des notes précédentes (au moins 3 notes).
 */
export enum CritereAlerte {
  INACTIVITE = 'INACTIVITE',
  ECHECS_QCM = 'ECHECS_QCM',
  LIVRABLE_EN_RETARD = 'LIVRABLE_EN_RETARD',
  SCORE_EN_CHUTE = 'SCORE_EN_CHUTE',
}

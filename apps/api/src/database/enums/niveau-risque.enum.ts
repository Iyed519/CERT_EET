/**
 * IA — Niveau de risque suggéré par le modèle de prédiction (service ml).
 *  - FAIBLE : probabilité sous le seuil d'alerte du modèle (0,355) ;
 *  - MOYEN : au-dessus du seuil ;
 *  - ELEVE : probabilité ≥ 0,60 (risque réel élevé d'après la calibration).
 * Une suggestion, jamais une décision : le formateur valide.
 */
export enum NiveauRisque {
  FAIBLE = 'FAIBLE',
  MOYEN = 'MOYEN',
  ELEVE = 'ELEVE',
}

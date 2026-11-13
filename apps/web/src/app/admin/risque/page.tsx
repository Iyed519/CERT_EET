'use client';
import { EnTetePage } from '../../../components/EnTetePage';
import { SectionRisque } from '../../../components/PredictionRisque';

/**
 * IA — Panneau administrateur de la prédiction du risque : toutes les
 * formations (l'API ne filtre pas pour l'administrateur), même présentation
 * que le tableau de bord du formateur. Lecture seule ; la sécurité réelle est
 * côté API (apprenant : 403).
 * US-UI-06 : en-tête commun.
 */
export default function RisqueAdminPage(): JSX.Element {
  return (
    <>
      <EnTetePage
        titre="Prédiction du risque"
        phrase="Vue par formation, pour toutes les formations ouvertes ou fermées. Le modèle suggère un niveau de risque d’échec ou d’abandon ; le formateur décide."
      />
      <SectionRisque />
    </>
  );
}

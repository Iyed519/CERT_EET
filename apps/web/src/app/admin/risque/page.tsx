'use client';
import { SectionRisque } from '../../../components/PredictionRisque';

/**
 * IA — Panneau administrateur de la prédiction du risque : toutes les
 * formations (l'API ne filtre pas pour l'administrateur), même présentation
 * que le tableau de bord du formateur. Lecture seule ; la sécurité réelle est
 * côté API (apprenant : 403).
 */
export default function RisqueAdminPage(): JSX.Element {
  return (
    <main className="page">
      <h1>Prédiction du risque</h1>
      <p className="page-intro">
        Vue par formation, pour toutes les formations ouvertes ou fermées. Le modèle suggère un niveau
        de risque d’échec ou d’abandon ; le formateur décide.
      </p>
      <SectionRisque />
    </main>
  );
}

'use client';
import { EnTetePage } from '../../components/EnTetePage';
import { ListeRapports } from '../../components/ListeRapports';
import { SectionPage } from '../../components/SectionPage';

/**
 * US-RPT-01 — « Mes rapports » : tous les rapports que j'ai demandés (lien
 * de l'email de fin de génération). Seul le demandeur voit et télécharge
 * ses rapports ; l'API renvoie 403 à un apprenant.
 */
export default function MesRapportsPage(): JSX.Element {
  return (
    <>
      <EnTetePage titre="Mes rapports" phrase="Rapports exportés, générés en arrière-plan. Ils ne sont visibles que par vous." />
      <SectionPage titre="Rapports demandés" icone="telecharger">
        <ListeRapports />
      </SectionPage>
    </>
  );
}

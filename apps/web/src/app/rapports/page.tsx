'use client';
import { ListeRapports } from '../../components/ListeRapports';

/**
 * US-RPT-01 — « Mes rapports » : tous les rapports que j'ai demandés (lien
 * de l'email de fin de génération). Seul le demandeur voit et télécharge
 * ses rapports ; l'API renvoie 403 à un apprenant.
 */
export default function MesRapportsPage(): JSX.Element {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes rapports</h1>
          <p className="page-subtitle">
            Rapports exportés, générés en arrière-plan. Ils ne sont visibles que par vous.
          </p>
        </div>
      </div>
      <section className="tdb-bloc" aria-label="Mes rapports">
        <ListeRapports />
      </section>
    </>
  );
}

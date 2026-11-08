'use client';
import type { CritereGrille } from '../lib/api';

/**
 * US-ATEL-03 — Grille de notation en lecture seule, pour l'apprenant (UC4 :
 * « la grille est affichée à l'apprenant dès l'ouverture de l'atelier »).
 * Mêmes classes que l'éditeur du formateur (GrilleNotation), sans action.
 */
export function GrilleLecture({ criteres }: { criteres: CritereGrille[] }): JSX.Element {
  if (criteres.length === 0) {
    return <p className="page-subtitle">La grille de notation n’est pas disponible.</p>;
  }
  return (
    <ol className="criteres">
      {criteres.map((c) => (
        <li key={c.id} className="critere">
          <div className="critere-tete">
            <span className="module-ordre">{c.ordre}</span>
            <div className="module-corps">
              <p className="critere-intitule">
                {c.intitule} <span className="critere-poids">{c.ponderation} %</span>
              </p>
              {c.description && <p className="critere-description">{c.description}</p>}
            </div>
          </div>
          <ul className="niveaux">
            {c.niveaux.map((n) => (
              <li key={n.ordre} className={`niveau niveau-${n.ordre}`}>
                <span className="niveau-libelle">{n.libelle}</span>
                <span className="niveau-plage">
                  {n.pointsMinPct}–{n.pointsMaxPct} %
                </span>
                {n.descripteur && <span className="niveau-descripteur">{n.descripteur}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

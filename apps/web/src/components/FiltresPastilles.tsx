'use client';

export interface OptionFiltre<T extends string> {
  valeur: T;
  libelle: string;
  compteur?: number;
}

/**
 * US-UX-02 — Filtres en pastilles, avec compteur : un groupe de boutons à
 * bascule (`aria-pressed`), un seul choisi. Le filtre actif est noir (le rouge
 * reste réservé à l'action principale).
 */
export function FiltresPastilles<T extends string>({
  options,
  valeur,
  onChange,
  libelle,
}: {
  options: OptionFiltre<T>[];
  valeur: T;
  onChange: (v: T) => void;
  /** Nom du groupe pour les lecteurs d'écran (« Filtrer les ateliers »). */
  libelle: string;
}): JSX.Element {
  return (
    <div className="filtres-pastilles" role="group" aria-label={libelle}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          className={`filtre-pastille${o.valeur === valeur ? ' filtre-pastille-actif' : ''}`}
          aria-pressed={o.valeur === valeur}
          onClick={() => onChange(o.valeur)}
        >
          {o.libelle}
          {o.compteur !== undefined && <span className="filtre-pastille-compteur">{o.compteur}</span>}
        </button>
      ))}
    </div>
  );
}

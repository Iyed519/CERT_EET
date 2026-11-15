'use client';
import { FormEvent, ReactNode, useId } from 'react';
import { Icone } from './Icone';

/**
 * US-UX-07 — Barre commune des listes : recherche, filtres (en pastilles), bouton
 * « Actualiser » discret et actions de la page, toujours dans le même ordre.
 *
 * Recherche : sans `onSoumettre`, elle filtre à la frappe (liste chargée en entier) ;
 * avec `onSoumettre`, elle est envoyée au serveur (bouton « Rechercher », « Effacer »).
 */
export function BarreListe({
  recherche,
  filtres,
  onActualiser,
  actualisation = false,
  actions,
}: {
  recherche?: {
    valeur: string;
    onChange: (v: string) => void;
    libelle: string;
    placeholder?: string;
    onSoumettre?: () => void;
    /** Recherche serveur déjà appliquée (affiche « Effacer »). */
    appliquee?: boolean;
    onEffacer?: () => void;
  };
  filtres?: ReactNode;
  onActualiser?: () => void;
  actualisation?: boolean;
  actions?: ReactNode;
}): JSX.Element {
  const id = useId();
  const soumettre = (e: FormEvent): void => {
    e.preventDefault();
    recherche?.onSoumettre?.();
  };
  return (
    <div className="barre-liste">
      {recherche && (
        <form className="barre-liste-recherche" role="search" onSubmit={soumettre}>
          <label className="sr-only" htmlFor={`${id}-recherche`}>
            {recherche.libelle}
          </label>
          <span className="barre-liste-loupe" aria-hidden="true">
            <Icone nom="recherche" taille={16} />
          </span>
          <input
            id={`${id}-recherche`}
            className="input"
            type="search"
            value={recherche.valeur}
            maxLength={255}
            placeholder={recherche.placeholder ?? recherche.libelle}
            onChange={(e) => recherche.onChange(e.target.value)}
          />
          {recherche.onSoumettre && (
            <button type="submit" className="btn-sm">
              Rechercher
            </button>
          )}
          {recherche.appliquee && recherche.onEffacer && (
            <button type="button" className="btn-discret" onClick={recherche.onEffacer}>
              Effacer
            </button>
          )}
        </form>
      )}
      {filtres && <div className="barre-liste-filtres">{filtres}</div>}
      {(onActualiser || actions) && (
        <div className="barre-liste-actions">
          {onActualiser && (
            <button type="button" className="btn-discret" onClick={onActualiser} disabled={actualisation}>
              <Icone nom="actualiser" taille={16} />
              Actualiser
            </button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

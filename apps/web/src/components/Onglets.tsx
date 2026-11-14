'use client';
import Link from 'next/link';
import { KeyboardEvent, ReactNode, useRef } from 'react';
import { Icone, NomIcone } from './Icone';
import { texteCompteur } from '../lib/ui-regles';

export interface Onglet {
  id: string;
  libelle: string;
  icone?: NomIcone;
  /** Nombre affiché à côté du libellé (masqué si absent). */
  compteur?: number;
  /** Compteur à traiter (pastille rouge) plutôt qu'informatif (gris). */
  compteurAlerte?: boolean;
  /** Onglet à adresse : un lien (adresse partageable, retour arrière du navigateur). */
  href?: string;
}


function Contenu({ o }: { o: Onglet }): JSX.Element {
  const c = texteCompteur(o);
  return (
    <>
      {o.icone && <Icone nom={o.icone} taille={18} />}
      <span>{o.libelle}</span>
      {c !== null && (
        <span className={`onglets-compteur${o.compteurAlerte ? ' onglets-compteur-alerte' : ''}`}>
          {c}
          {o.compteurAlerte && <span className="sr-only"> à traiter</span>}
        </span>
      )}
    </>
  );
}

/**
 * US-UX-01 — Onglets d'une page.
 *
 * - Onglets à adresse (chaque onglet a `href`) : une barre de liens
 *   (`<nav>`, `aria-current="page"`), chaque onglet est une page à part
 *   entière que l'on peut partager.
 * - Onglets dans la page (`onChange`) : motif ARIA « tabs » (`role="tablist"`,
 *   `tab`, `aria-selected`, `aria-controls`), flèches gauche / droite, Origine
 *   et Fin ; le panneau est rendu par l'appelant avec `PanneauOnglet`.
 */
export function Onglets({
  onglets,
  actif,
  onChange,
  libelle,
  idBase = 'onglet',
}: {
  onglets: Onglet[];
  actif: string;
  onChange?: (id: string) => void;
  /** Nom de la barre pour les lecteurs d'écran (« Sections de la formation »). */
  libelle: string;
  idBase?: string;
}): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  if (onglets.every((o) => o.href)) {
    return (
      <nav className="onglets" aria-label={libelle}>
        {onglets.map((o) => {
          const estActif = o.id === actif;
          return (
            <Link
              key={o.id}
              href={o.href as string}
              className={`onglets-onglet${estActif ? ' onglets-actif' : ''}`}
              aria-current={estActif ? 'page' : undefined}
              scroll={false}
            >
              <Contenu o={o} />
            </Link>
          );
        })}
      </nav>
    );
  }

  const surTouche = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let cible = -1;
    if (e.key === 'ArrowRight') cible = (i + 1) % onglets.length;
    else if (e.key === 'ArrowLeft') cible = (i - 1 + onglets.length) % onglets.length;
    else if (e.key === 'Home') cible = 0;
    else if (e.key === 'End') cible = onglets.length - 1;
    if (cible < 0) return;
    e.preventDefault();
    onChange?.(onglets[cible].id);
    refs.current[cible]?.focus();
  };

  return (
    <div className="onglets" role="tablist" aria-label={libelle}>
      {onglets.map((o, i) => {
        const estActif = o.id === actif;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-${o.id}`}
            aria-selected={estActif}
            aria-controls={`${idBase}-panneau-${o.id}`}
            tabIndex={estActif ? 0 : -1}
            className={`onglets-onglet${estActif ? ' onglets-actif' : ''}`}
            onClick={() => onChange?.(o.id)}
            onKeyDown={(e) => surTouche(e, i)}
          >
            <Contenu o={o} />
          </button>
        );
      })}
    </div>
  );
}

/** Panneau d'un onglet dans la page (à placer sous `Onglets`). */
export function PanneauOnglet({
  id,
  idBase = 'onglet',
  children,
}: {
  id: string;
  idBase?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div role="tabpanel" id={`${idBase}-panneau-${id}`} aria-labelledby={`${idBase}-${id}`} tabIndex={0} className="onglets-panneau">
      {children}
    </div>
  );
}

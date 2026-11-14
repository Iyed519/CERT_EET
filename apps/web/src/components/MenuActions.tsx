'use client';
import Link from 'next/link';
import { KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icone, NomIcone } from './Icone';

export interface ElementMenu {
  libelle: string;
  icone?: NomIcone;
  /** Lien (navigation) ou action (bouton) : l'un des deux. */
  href?: string;
  onClick?: () => void;
  /** Action dangereuse : texte rouge sombre ; sa confirmation reste celle de l'action. */
  danger?: boolean;
  desactive?: boolean;
  /** Séparateur affiché avant cet élément. */
  separe?: boolean;
}

/**
 * US-UX-01 — Menu « Plus d'actions » (⋯) d'une ligne, d'une carte ou d'un en-tête.
 *
 * Bouton `aria-haspopup="menu"` ; la liste (`role="menu"`) s'ouvre en position
 * fixe sous le bouton (jamais coupée par un tableau qui défile), au-dessus s'il
 * n'y a pas la place. Clavier : Entrée, Espace ou flèche bas ouvrent et placent
 * le focus sur le premier élément ; flèches, Origine et Fin pour se déplacer ;
 * Échap ferme et rend le focus au bouton ; Tab ferme. Clic à l'extérieur, défilement
 * ou redimensionnement ferment aussi.
 *
 * `libelle` donne le texte du bouton (sinon l'icône ⋯ seule, nommée par
 * `aria-label`) ; `contexte` précise pour les lecteurs d'écran (« pour DevOps »).
 */
export function MenuActions({
  elements,
  libelle,
  icone,
  contexte,
  className,
  principal = false,
}: {
  elements: ElementMenu[];
  libelle?: string;
  icone?: NomIcone;
  contexte?: string;
  className?: string;
  /** Bouton plein (action principale de la zone, par exemple « Ajouter »). */
  principal?: boolean;
}): JSX.Element {
  const [ouvert, setOuvert] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const actifs = elements.filter((e) => !e.desactive);

  const fermer = useCallback((rendreFocus: boolean) => {
    setOuvert(false);
    setPosition(null);
    if (rendreFocus) bouton.current?.focus();
  }, []);

  const placer = useCallback(() => {
    const b = bouton.current?.getBoundingClientRect();
    const l = liste.current;
    if (!b || !l) return;
    const largeur = l.offsetWidth;
    const hauteur = l.offsetHeight;
    const marge = 8;
    let left = b.right - largeur;
    if (left < marge) left = Math.min(b.left, window.innerWidth - largeur - marge);
    left = Math.max(marge, left);
    let top = b.bottom + 4;
    if (top + hauteur > window.innerHeight - marge && b.top - hauteur - 4 > marge) top = b.top - hauteur - 4;
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (ouvert) placer();
  }, [ouvert, placer]);

  // Focus sur le premier élément à l'ouverture.
  useEffect(() => {
    if (!ouvert || !position) return;
    const premier = liste.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    premier?.focus();
  }, [ouvert, position]);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent): void => {
      const cible = e.target as Node;
      if (!liste.current?.contains(cible) && !bouton.current?.contains(cible)) fermer(false);
    };
    const surDefilement = (e: Event): void => {
      if (liste.current && e.target instanceof Node && liste.current.contains(e.target)) return;
      fermer(false);
    };
    const surTaille = (): void => fermer(false);
    document.addEventListener('mousedown', surClic);
    window.addEventListener('scroll', surDefilement, true);
    window.addEventListener('resize', surTaille);
    return () => {
      document.removeEventListener('mousedown', surClic);
      window.removeEventListener('scroll', surDefilement, true);
      window.removeEventListener('resize', surTaille);
    };
  }, [ouvert, fermer]);

  const items = (): HTMLElement[] =>
    Array.from(liste.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  const surToucheBouton = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOuvert(true);
    }
  };

  const surToucheListe = (e: KeyboardEvent<HTMLDivElement>): void => {
    const tous = items();
    const i = tous.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermer(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      tous[(i + 1) % tous.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      tous[(i - 1 + tous.length) % tous.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      tous[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      tous[tous.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      fermer(false);
    }
  };

  const nomAccessible = libelle
    ? contexte
      ? `${libelle} — ${contexte}`
      : undefined
    : `Plus d’actions${contexte ? ` — ${contexte}` : ''}`;

  return (
    <div className={`menu-actions${className ? ` ${className}` : ''}`}>
      <button
        ref={bouton}
        type="button"
        className={`${principal ? 'btn-sm btn-primary-sm' : 'btn-sm'} menu-actions-bouton${libelle ? '' : ' menu-actions-icone'}`}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idMenu : undefined}
        aria-label={nomAccessible}
        title={libelle ? undefined : 'Plus d’actions'}
        disabled={actifs.length === 0}
        onClick={() => (ouvert ? fermer(false) : setOuvert(true))}
        onKeyDown={surToucheBouton}
      >
        {libelle ? (
          <>
            {icone && <Icone nom={icone} taille={16} />}
            <span>{libelle}</span>
            <Icone nom="chevron-bas" taille={16} />
          </>
        ) : (
          <Icone nom="plus-actions" taille={18} />
        )}
      </button>
      {ouvert && (
        <div
          ref={liste}
          id={idMenu}
          role="menu"
          aria-label={libelle ?? 'Plus d’actions'}
          className="menu-actions-liste"
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
          onKeyDown={surToucheListe}
        >
          {elements.map((e, i) => {
            const classe = `menu-actions-element${e.danger ? ' menu-actions-danger' : ''}${e.separe && i > 0 ? ' menu-actions-separe' : ''}`;
            const contenu = (
              <>
                {e.icone ? <Icone nom={e.icone} taille={16} /> : <span className="menu-actions-sans-icone" aria-hidden="true" />}
                <span>{e.libelle}</span>
              </>
            );
            if (e.href && !e.desactive) {
              return (
                <Link key={e.libelle} href={e.href} role="menuitem" tabIndex={-1} className={classe} onClick={() => fermer(false)}>
                  {contenu}
                </Link>
              );
            }
            return (
              <button
                key={e.libelle}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={classe}
                aria-disabled={e.desactive ? true : undefined}
                onClick={() => {
                  if (e.desactive) return;
                  fermer(false);
                  e.onClick?.();
                }}
              >
                {contenu}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

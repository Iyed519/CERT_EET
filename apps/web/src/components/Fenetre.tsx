'use client';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { CroixFermeture } from './CroixFermeture';

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * US-UI-01 — LA fenêtre (carte modale) de l'application : une seule
 * implémentation accessible, réutilisée par toutes les modales.
 *
 *  - `role="dialog"`, `aria-modal`, titre relié par `aria-labelledby` ;
 *  - le focus entre dans la fenêtre à l'ouverture, y reste (Tab / Maj+Tab
 *    bouclent), et revient à l'élément qui l'avait ouverte à la fermeture ;
 *  - fermeture par la croix, la touche Échap ou un clic à l'extérieur, sauf
 *    pendant une action en cours (`occupe`) ;
 *  - `taille` : « normale », « large » (listes, revues) ; sur un écran
 *    étroit, la fenêtre occupe tout l'écran.
 * Une fenêtre ouverte par-dessus une autre (ex. éditer une question depuis
 * une revue) garde la main : seule la plus haute réagit à Échap et au piège
 * du focus.
 */
export function Fenetre({
  titre,
  sousTitre,
  onClose,
  occupe = false,
  taille = 'normale',
  children,
  actions,
  classe,
}: {
  titre: ReactNode;
  sousTitre?: ReactNode;
  onClose: () => void;
  occupe?: boolean;
  taille?: 'normale' | 'large';
  children?: ReactNode;
  actions?: ReactNode;
  classe?: string;
}): JSX.Element {
  const idTitre = useId();
  const carte = useRef<HTMLElement>(null);
  const fermer = useRef(onClose);
  const bloque = useRef(occupe);
  fermer.current = onClose;
  bloque.current = occupe;

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    const noeud = carte.current;
    // Le focus va sur la fenêtre elle-même (son titre est lu) ; Tab mène au premier contrôle.
    (noeud?.querySelector<HTMLElement>('[autofocus]') ?? noeud)?.focus();
    const auDessus = (): boolean => {
      // Toute fenêtre ouverte après celle-ci (y compris une ancienne modale) garde la main.
      const fenetres = document.querySelectorAll('.profil-overlay');
      return fenetres[fenetres.length - 1] === noeud?.parentElement;
    };
    const touche = (e: KeyboardEvent): void => {
      if (!noeud || !auDessus()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!bloque.current) fermer.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const elements = Array.from(noeud.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }
      const debut = elements[0];
      const fin = elements[elements.length - 1];
      const actif = document.activeElement;
      if (e.shiftKey && (actif === debut || actif === noeud || !noeud.contains(actif))) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && (actif === fin || !noeud.contains(actif))) {
        e.preventDefault();
        debut.focus();
      }
    };
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('keydown', touche);
      if (avant && document.contains(avant)) avant.focus();
    };
  }, []);

  return (
    <div
      className="profil-overlay"
      data-fenetre=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !occupe) onClose();
      }}
    >
      <section
        ref={carte}
        className={`profil-card modal-closable fenetre${taille === 'large' ? ' modal-wide' : ''}${classe ? ` ${classe}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
      >
        <CroixFermeture onClose={onClose} disabled={occupe} />
        <h2 className="auth-title" id={idTitre}>
          {titre}
        </h2>
        {sousTitre && <p className="auth-subtitle">{sousTitre}</p>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </section>
    </div>
  );
}

'use client';
import { useEffect } from 'react';

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * US-UI-05 — Même comportement pour TOUTES les fenêtres de formulaire
 * (`.profil-overlay`) qui ne sont pas bâties sur `Fenetre` : rôle de dialogue,
 * focus placé dans la fenêtre puis piégé, Échap et clic sur le fond qui
 * déclenchent sa propre croix (donc son `onClose`, et rien si la croix est
 * désactivée pendant un envoi), focus rendu à l'élément d'origine. Seule la
 * fenêtre la plus haute réagit. Une fenêtre sans croix (obligatoire) ne se
 * ferme pas.
 */
export function GestionFenetres(): null {
  useEffect(() => {
    const origines = new WeakMap<Element, HTMLElement | null>();
    let dernierFocus: HTMLElement | null = null;
    const suivreFocus = (e: FocusEvent): void => {
      const cible = e.target as HTMLElement | null;
      if (cible && !cible.closest('.profil-overlay')) dernierFocus = cible;
    };
    const gerees = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('.profil-overlay:not([data-fenetre])'));
    const plusHaute = (): HTMLElement | null => {
      const toutes = document.querySelectorAll<HTMLElement>('.profil-overlay');
      const derniere = toutes[toutes.length - 1] ?? null;
      return derniere && !derniere.hasAttribute('data-fenetre') ? derniere : null;
    };
    const preparer = (overlay: HTMLElement): void => {
      if (origines.has(overlay)) return;
      origines.set(overlay, dernierFocus);
      const carte = overlay.querySelector<HTMLElement>('.profil-card') ?? overlay;
      if (!overlay.querySelector('[role="dialog"]') && overlay.getAttribute('role') !== 'dialog') {
        carte.setAttribute('role', 'dialog');
      }
      const dialogue = overlay.getAttribute('role') === 'dialog' ? overlay : carte;
      if (!dialogue.hasAttribute('aria-modal')) dialogue.setAttribute('aria-modal', 'true');
      const titre = carte.querySelector<HTMLElement>('h1, h2');
      if (titre && !dialogue.hasAttribute('aria-labelledby') && !dialogue.hasAttribute('aria-label')) {
        if (!titre.id) titre.id = `fenetre-${Math.random().toString(36).slice(2, 9)}`;
        dialogue.setAttribute('aria-labelledby', titre.id);
      }
      if (!carte.hasAttribute('tabindex')) carte.setAttribute('tabindex', '-1');
      if (!overlay.contains(document.activeElement)) carte.focus();
    };
    // US-UI-06 : sans croix, repli sur un bouton « Annuler » ou « Fermer » actif.
    const fermer = (overlay: HTMLElement): void => {
      const croix =
        overlay.querySelector<HTMLButtonElement>('.modal-close') ??
        Array.from(overlay.querySelectorAll<HTMLButtonElement>('.modal-actions button')).find((b) =>
          /^(annuler|fermer)$/i.test((b.textContent ?? '').trim()),
        ) ??
        null;
      if (croix && !croix.disabled) croix.click();
    };
    const observateur = new MutationObserver(() => {
      gerees().forEach(preparer);
      // Fenêtres retirées : focus rendu à l'élément d'origine s'il existe encore.
      if (!document.querySelector('.profil-overlay')) {
        const actif = document.activeElement;
        if ((!actif || actif === document.body) && dernierFocus && document.contains(dernierFocus)) {
          dernierFocus.focus();
        }
      }
    });
    const touche = (e: KeyboardEvent): void => {
      const overlay = plusHaute();
      if (!overlay) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Une seule fenêtre par Échap : la fenêtre du dessous ne doit pas réagir ensuite.
        e.stopImmediatePropagation();
        fermer(overlay);
        return;
      }
      if (e.key !== 'Tab') return;
      const elements = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
        (el) => el.offsetParent !== null,
      );
      if (elements.length === 0) return;
      const debut = elements[0];
      const fin = elements[elements.length - 1];
      const actif = document.activeElement;
      const dedans = actif ? overlay.contains(actif) : false;
      const carte = overlay.querySelector('.profil-card');
      if (e.shiftKey && (actif === debut || actif === carte || !dedans)) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && (actif === fin || !dedans)) {
        e.preventDefault();
        debut.focus();
      }
    };
    const clic = (e: MouseEvent): void => {
      const overlay = plusHaute();
      if (overlay && e.target === overlay) fermer(overlay);
    };
    document.addEventListener('focusin', suivreFocus);
    document.addEventListener('keydown', touche);
    document.addEventListener('mousedown', clic);
    observateur.observe(document.body, { childList: true, subtree: true });
    gerees().forEach(preparer);
    return () => {
      observateur.disconnect();
      document.removeEventListener('focusin', suivreFocus);
      document.removeEventListener('keydown', touche);
      document.removeEventListener('mousedown', clic);
    };
  }, []);
  return null;
}

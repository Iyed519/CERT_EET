'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { CompteursNavigation, getCompteursNavigation } from '../lib/api';
import { Icone, NomIcone } from './Icone';
import {
  CleCompteur,
  GroupeLateral,
  NAVIGATION_LATERALE,
  Role,
  entreeActive,
  texteCompteurMenu,
} from './navigation';

const CLE_REDUIT = 'cert_eet.menu-reduit';
const EVENEMENT_RAFRAICHIR = 'cert-eet:compteurs';
const PERIODE_MS = 60_000;

/** Une page qui vient de traiter quelque chose peut demander la relecture des compteurs du menu. */
export function rafraichirCompteurs(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_RAFRAICHIR));
}

function lireReduit(): boolean {
  try {
    return window.localStorage.getItem(CLE_REDUIT) === '1';
  } catch {
    return false;
  }
}

function ecrireReduit(reduit: boolean): void {
  try {
    window.localStorage.setItem(CLE_REDUIT, reduit ? '1' : '0');
  } catch {
    /* stockage indisponible : le choix vaut pour la page seulement */
  }
}

/** Compteurs du menu : relus à chaque page, au retour sur l'onglet, toutes les 60 s et sur demande. */
function useCompteurs(chemin: string | null): CompteursNavigation | null {
  const [compteurs, setCompteurs] = useState<CompteursNavigation | null>(null);
  useEffect(() => {
    let vivant = true;
    const lire = (): void => {
      getCompteursNavigation()
        .then((c) => {
          if (vivant) setCompteurs(c);
        })
        .catch(() => {
          /* échec silencieux : le menu reste utilisable sans compteurs */
        });
    };
    lire();
    const minuterie = window.setInterval(lire, PERIODE_MS);
    const surVisibilite = (): void => {
      if (document.visibilityState === 'visible') lire();
    };
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener(EVENEMENT_RAFRAICHIR, lire);
    return () => {
      vivant = false;
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', surVisibilite);
      window.removeEventListener(EVENEMENT_RAFRAICHIR, lire);
    };
  }, [chemin]);
  return compteurs;
}

function valeur(compteurs: CompteursNavigation | null, cle: CleCompteur | undefined): number {
  if (!compteurs || !cle) return 0;
  const v = (compteurs as unknown as Record<string, unknown>)[cle];
  return typeof v === 'number' ? v : 0;
}

function Groupes({
  groupes,
  chemin,
  compteurs,
  idBase,
}: {
  groupes: GroupeLateral[];
  chemin: string | null;
  compteurs: CompteursNavigation | null;
  idBase: string;
}): JSX.Element {
  const active = entreeActive(groupes, chemin);
  return (
    <>
      {groupes.map((g, i) => {
        const idTitre = `${idBase}-groupe-${i}`;
        return (
          <div key={g.titre ?? 'accueil'} className="nav-l-bloc" role="group" aria-labelledby={g.titre ? idTitre : undefined}>
            {g.titre && (
              <p id={idTitre} className="nav-l-groupe">
                <span className="nav-l-groupe-texte">{g.titre}</span>
              </p>
            )}
            <ul className="nav-l-liste">
              {g.entrees.map((e) => {
                const estActive = active?.href === e.href;
                const n = valeur(compteurs, e.compteur);
                const texte = texteCompteurMenu(n);
                return (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      className={`nav-l-entree${estActive ? ' nav-l-actif' : ''}`}
                      aria-current={estActive ? 'page' : undefined}
                      data-infobulle={texte ? `${e.libelle} (${texte})` : e.libelle}
                    >
                      <Icone nom={e.icone as NomIcone} taille={20} />
                      <span className="nav-l-libelle">{e.libelle}</span>
                      {texte && (
                        <span className="nav-l-compteur">
                          <span aria-hidden="true">{texte}</span>
                          <span className="sr-only">, {n} en attente</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/**
 * US-UX-02 — Menu latéral du formateur et de l'administrateur.
 *
 * - Écran large (≥ 1 024 px) : menu fixe sous l'en-tête, groupes titrés,
 *   entrée active mise en évidence (sous-pages comprises), compteurs ;
 *   réductible aux icônes (choix mémorisé), infobulle sur chaque icône.
 * - Écran étroit : le bouton menu de l'en-tête ouvre un tiroir avec les mêmes
 *   groupes ; Échap, la croix, un clic sur le voile ou un changement de page
 *   le ferment, et le focus revient au bouton.
 * Le corps de page est décalé par `body[data-nav-laterale]` (CSS).
 */
export function NavigationLaterale({
  role,
  tiroirOuvert,
  fermerTiroir,
  enTeteTiroir,
  piedTiroir,
}: {
  role: Role;
  tiroirOuvert: boolean;
  fermerTiroir: () => void;
  /** Contenu ajouté en tête du tiroir (recherche). */
  enTeteTiroir?: ReactNode;
  /** Contenu ajouté au pied du tiroir (liens du compte). */
  piedTiroir?: ReactNode;
}): JSX.Element | null {
  const chemin = usePathname();
  const groupes = NAVIGATION_LATERALE[role];
  const compteurs = useCompteurs(chemin);
  const [reduit, setReduit] = useState(false);
  const croix = useRef<HTMLButtonElement>(null);
  const idBase = useId();

  useEffect(() => {
    setReduit(lireReduit());
  }, []);

  useEffect(() => {
    document.body.dataset.navLaterale = reduit ? 'reduite' : 'ouverte';
    return () => {
      delete document.body.dataset.navLaterale;
    };
  }, [reduit]);

  const basculer = useCallback(() => {
    setReduit((r) => {
      ecrireReduit(!r);
      return !r;
    });
  }, []);

  useEffect(() => {
    if (!tiroirOuvert) return;
    croix.current?.focus();
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fermerTiroir();
      } else if (e.key === 'Tab') {
        // Focus gardé dans le tiroir.
        const tiroir = document.getElementById('tiroir-navigation');
        const elements = Array.from(
          tiroir?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') ?? [],
        );
        if (elements.length === 0) return;
        const premier = elements[0];
        const dernier = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [tiroirOuvert, fermerTiroir]);

  if (!groupes) return null;

  return (
    <>
      <aside className={`nav-laterale${reduit ? ' nav-laterale-reduite' : ''}`}>
        <nav className="nav-l-nav" aria-label="Navigation principale">
          <Groupes groupes={groupes} chemin={chemin} compteurs={compteurs} idBase={`${idBase}-l`} />
        </nav>
        <button
          type="button"
          className="nav-l-reduire"
          aria-pressed={reduit}
          data-infobulle={reduit ? 'Déplier le menu' : 'Réduire le menu'}
          onClick={basculer}
        >
          <Icone nom={reduit ? 'deplier-menu' : 'reduire-menu'} taille={20} />
          <span className="nav-l-libelle">{reduit ? 'Déplier le menu' : 'Réduire le menu'}</span>
        </button>
      </aside>
      {tiroirOuvert && (
        <>
          <div className="tiroir-voile" aria-hidden="true" onClick={fermerTiroir} />
          <div id="tiroir-navigation" className="tiroir" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="tiroir-tete">
              <span className="tiroir-titre">Menu</span>
              <button ref={croix} type="button" className="tiroir-croix" aria-label="Fermer le menu" onClick={fermerTiroir}>
                <Icone nom="fermer" taille={20} />
              </button>
            </div>
            {enTeteTiroir}
            <nav className="nav-l-nav" aria-label="Navigation principale (menu)">
              <Groupes groupes={groupes} chemin={chemin} compteurs={compteurs} idBase={`${idBase}-t`} />
            </nav>
            {piedTiroir}
          </div>
        </>
      )}
    </>
  );
}

'use client';
import Link from 'next/link';
import { Icone } from './Icone';
import { ElementMenu, MenuActions } from './MenuActions';

/**
 * US-UX-07 — Actions d'une ligne de liste : UNE action visible (bouton secondaire)
 * et un menu « ⋯ » avec toutes les autres (dangereuses en dernier, séparées : leur
 * confirmation reste celle de l'action). Avec `libelleMenu` et sans action visible,
 * le menu est un bouton nommé (« Gérer ») qui porte toutes les actions.
 */
export function ActionsLigne({
  principale,
  autres,
  contexte,
  libelleMenu,
}: {
  principale: ElementMenu | null;
  autres: ElementMenu[];
  /** Pour les lecteurs d'écran : « Plus d'actions — Sana Ben Ali ». */
  contexte: string;
  libelleMenu?: string;
}): JSX.Element | null {
  if (!principale && autres.length === 0) return null;
  return (
    <div className="actions-ligne">
      {principale &&
        (principale.href ? (
          <Link className="btn-sm btn-lien" href={principale.href}>
            {principale.icone && <Icone nom={principale.icone} taille={16} />}
            {principale.libelle}
          </Link>
        ) : (
          <button
            type="button"
            className={`btn-sm${principale.danger ? ' btn-danger' : ''}`}
            disabled={principale.desactive}
            onClick={principale.onClick}
          >
            {principale.icone && <Icone nom={principale.icone} taille={16} />}
            {principale.libelle}
          </button>
        ))}
      {autres.length > 0 && (
        <MenuActions
          elements={autres}
          contexte={contexte}
          libelle={principale ? undefined : libelleMenu}
          icone={principale ? undefined : libelleMenu ? 'parametres' : undefined}
        />
      )}
    </div>
  );
}

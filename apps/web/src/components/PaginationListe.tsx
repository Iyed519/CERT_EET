'use client';

/**
 * US-UX-07 — Pagination commune des listes : « 12 comptes · page 1 / 2 », puis
 * Précédent / Suivant (désactivés aux bornes, toujours présents pour garder leur place).
 * Rien quand la liste est vide.
 */
export function PaginationListe({
  page,
  pages,
  total,
  unite,
  onPage,
  desactive = false,
  filtre,
}: {
  page: number;
  pages: number;
  total: number;
  /** [singulier, pluriel] : ['compte', 'comptes']. */
  unite: [string, string];
  onPage: (p: number) => void;
  desactive?: boolean;
  /** Filtres appliqués, rappelés après le nombre (« · filtre : Actif, Formateurs »). */
  filtre?: string | null;
}): JSX.Element | null {
  if (total === 0) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted-cell">
        {total} {total > 1 ? unite[1] : unite[0]}
        {filtre ? ` · filtre : ${filtre}` : ''}
        {pages > 1 ? ` · page ${page} / ${pages}` : ''}
      </span>
      {total > 0 && (
        <div className="row-actions">
          <button type="button" className="btn-sm" disabled={desactive || page <= 1} onClick={() => onPage(page - 1)}>
            Précédent
          </button>
          <button type="button" className="btn-sm" disabled={desactive || page >= pages} onClick={() => onPage(page + 1)}>
            Suivant
          </button>
        </div>
      )}
    </nav>
  );
}

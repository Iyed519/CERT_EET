'use client';
import { useEffect, useState } from 'react';

/**
 * US-UX-07 — Compteurs des filtres en pastilles d'une liste filtrée côté serveur :
 * un appel existant par statut (avec `limit=1`, seul le total est lu), en parallèle,
 * relancés quand `version` change (après une action). Un échec laisse le compteur absent.
 */
export function useCompteurs<T extends string>(
  statuts: readonly T[],
  total: (statut: T) => Promise<number>,
  version: number,
): Partial<Record<T, number>> {
  const [compteurs, setCompteurs] = useState<Partial<Record<T, number>>>({});
  useEffect(() => {
    let actif = true;
    void Promise.allSettled(statuts.map((s) => total(s))).then((resultats) => {
      if (!actif) return;
      const c: Partial<Record<T, number>> = {};
      resultats.forEach((r, i) => {
        if (r.status === 'fulfilled') c[statuts[i]] = r.value;
      });
      setCompteurs(c);
    });
    return () => {
      actif = false;
    };
    // `statuts` et `total` sont des constantes de module dans les pages appelantes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return compteurs;
}

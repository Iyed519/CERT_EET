/**
 * US-UX-01 — Règles pures des briques d'interface (onglets, étapes), testées
 * par `node --test` (`npm run test:unitaires`). Module sans import.
 */

/** Compteur d'un onglet : rien si absent ; un zéro « à traiter » est masqué, un zéro informatif reste. */
export function texteCompteur(o: { compteur?: number | null; compteurAlerte?: boolean }): string | null {
  if (o.compteur === undefined || o.compteur === null) return null;
  if (o.compteur === 0 && o.compteurAlerte) return null;
  return o.compteur > 999 ? '999+' : String(o.compteur);
}

/** Première étape qui n'est pas faite (la « prochaine étape »), ou -1 si tout est fait. */
export function etapeCourante(etapes: Array<{ etat: string }>): number {
  return etapes.findIndex((e) => e.etat !== 'fait');
}

/** US-UX-02 — Regroupe des lignes par formation, dans l'ordre reçu (l'API trie déjà). */
export function parFormation<T extends { formationId: string; formationTitre: string }>(
  lignes: T[],
): Array<{ id: string; titre: string; lignes: T[] }> {
  const groupes = new Map<string, { id: string; titre: string; lignes: T[] }>();
  for (const l of lignes) {
    const g = groupes.get(l.formationId) ?? { id: l.formationId, titre: l.formationTitre, lignes: [] };
    g.lignes.push(l);
    groupes.set(l.formationId, g);
  }
  return [...groupes.values()];
}

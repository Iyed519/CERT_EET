import { QuestionTiree } from '../../../database/entities/tentative-qcm.entity';

/**
 * US-QCM-11 — Règles PURES de l'historique des tentatives.
 *
 * L'historique est en LECTURE SEULE : il ne fait que lire ce que le passage
 * et la notation ont écrit (une tentative NOTEE est figée par un déclencheur
 * depuis US-QCM-08). Côté apprenant, aucune bonne réponse ne sort ici : le
 * corrigé reste servi par sa route dédiée, selon ses propres règles (US-QCM-09).
 */

export const BORNES_HISTORIQUE = { lignesMax: 200 } as const;
export const MESSAGE_TENTATIVE_INTROUVABLE = 'Tentative introuvable.';

/** Options cochées par question, dans l'ordre du tirage ; questions du plan seulement. */
export function selectionsDansLOrdre(
  plan: QuestionTiree[],
  cochees: Map<string, Set<string>>,
): Record<string, string[]> {
  const resultat: Record<string, string[]> = {};
  for (const tiree of plan) {
    const c = cochees.get(tiree.questionId);
    if (c && c.size > 0) resultat[tiree.questionId] = tiree.optionIds.filter((id) => c.has(id));
  }
  return resultat;
}

/** Score et réussite ne sont lus que sur une tentative NOTEE (sinon null). */
export function resultatVisible<T>(statut: string, valeur: T | null): T | null {
  return statut === 'NOTEE' ? valeur : null;
}

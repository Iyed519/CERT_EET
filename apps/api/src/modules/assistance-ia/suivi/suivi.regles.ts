/**
 * US-IA-07 — Règles PURES du suivi en temps réel (ADR-06, SSE) des
 * traitements asynchrones : indexation d'un support, génération de questions.
 *
 * Le flux lit l'état en base à intervalle court et n'émet qu'aux CHANGEMENTS
 * (indépendant du worker et de l'instance qui le fait tourner) ; il se ferme
 * de lui-même à l'état final, ou après une durée maximale (le client reprend
 * alors par l'API REST, qui reste la source de vérité).
 */

export const SUIVI_TEMPS_REEL = {
  /** Lecture de l'état en base (ms). */
  intervalleMs: 1000,
  /** Durée maximale d'un flux (ms) : au-delà, le client se reconnecte. */
  dureeMaxMs: 10 * 60_000,
} as const;

export type NatureSuivi = 'support' | 'generation';

const ETATS_FINAUX: Record<NatureSuivi, readonly string[]> = {
  support: ['INDEXE', 'ECHEC_INDEXATION'],
  generation: ['TERMINEE', 'ECHEC'],
};

/** L'état est-il final (le flux s'arrête après l'avoir envoyé) ? */
export function estFinal(nature: NatureSuivi, statut: string): boolean {
  return ETATS_FINAUX[nature].includes(statut);
}

/** Ce qui est envoyé au navigateur : liste blanche, rien d'autre que l'avancement. */
export interface EtatSuivi {
  nature: NatureSuivi;
  id: string;
  statut: string;
  nbTentatives: number;
  derniereErreur: string | null;
  /** Support : segments indexés ; génération : suggestions valides. */
  resultat: number | null;
  final: boolean;
}

export function etatSupport(v: {
  id: string;
  statut: string;
  nbTentatives: number;
  derniereErreur: string | null;
  nbSegments: number | null;
}): EtatSuivi {
  return {
    nature: 'support',
    id: v.id,
    statut: v.statut,
    nbTentatives: v.nbTentatives,
    derniereErreur: v.derniereErreur,
    resultat: v.nbSegments,
    final: estFinal('support', v.statut),
  };
}

export function etatGeneration(v: {
  id: string;
  statut: string;
  nbTentatives: number;
  derniereErreur: string | null;
  nbSuggestions: number | null;
}): EtatSuivi {
  return {
    nature: 'generation',
    id: v.id,
    statut: v.statut,
    nbTentatives: v.nbTentatives,
    derniereErreur: v.derniereErreur,
    resultat: v.nbSuggestions,
    final: estFinal('generation', v.statut),
  };
}

/** Deux états sont-ils identiques (pas d'envoi) ? */
export function memeEtat(a: EtatSuivi | null, b: EtatSuivi): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}

import { BadRequestException } from '@nestjs/common';

/**
 * US-IA-05 — Règles PURES de la traçabilité des générations IA (consultation
 * administrateur). Lecture seule : tout ce qui est affiché a été écrit par le
 * lancement (US-IA-02), le pipeline (US-IA-03) et la révision (US-IA-04).
 */

export const BORNES_TRACABILITE = { limiteDefaut: 20, limiteMax: 100 } as const;

export const MESSAGE_PERIODE_INVALIDE = 'La date de début doit précéder la date de fin.';
export const MESSAGE_GENERATION_INTROUVABLE = 'Génération introuvable.';

/** Actions d'audit qui composent l'historique d'une génération et de ses suggestions. */
export const ACTIONS_TRACEES = [
  'GENERATION_IA_LANCEE',
  'GENERATION_IA_TERMINEE',
  'GENERATION_IA_ECHEC',
  'SUGGESTION_ACCEPTEE',
  'SUGGESTION_MODIFIEE',
  'SUGGESTION_REJETEE',
] as const;

/** Période [du, au] : `du` strictement après `au` -> 400. */
export function verifierPeriode(du?: string, au?: string): void {
  if (du && au && new Date(du).getTime() > new Date(au).getTime()) {
    throw new BadRequestException(MESSAGE_PERIODE_INVALIDE);
  }
}

/** Décompte des décisions, toutes les clés présentes (0 par défaut). */
export interface Decisions {
  proposees: number;
  acceptees: number;
  modifiees: number;
  rejetees: number;
}

export function decompte(lignes: Array<{ statut: string; n: number }>): Decisions {
  const par = new Map(lignes.map((l) => [l.statut, Number(l.n)]));
  return {
    proposees: par.get('PROPOSEE') ?? 0,
    acceptees: par.get('ACCEPTEE') ?? 0,
    modifiees: par.get('MODIFIEE') ?? 0,
    rejetees: par.get('REJETEE') ?? 0,
  };
}

/** Décalage SQL d'une page (1 = la première). */
export function decalage(page: number, limite: number): number {
  return (Math.max(page, 1) - 1) * limite;
}

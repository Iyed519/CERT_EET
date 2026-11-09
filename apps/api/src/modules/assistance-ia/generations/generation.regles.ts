import { ConflictException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { StatutSupport } from '../../../database/enums/statut-support.enum';

/**
 * Règles PURES du lancement d'une génération (US-IA-02, DS-06 partie 2).
 * Aucune base, aucune horloge, aucune entrée-sortie.
 */

/** Types que le pipeline sait produire et que l'éditeur de QCM sait corriger. */
export const TYPES_GENERABLES = ['QCU', 'QCM', 'VRAI_FAUX'] as const;
export type TypeGenerable = (typeof TYPES_GENERABLES)[number];

/** Niveaux de difficulté (mêmes valeurs que les questions, US-QCM-01). */
export const NIVEAUX_GENERATION = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'] as const;
export type NiveauGeneration = (typeof NIVEAUX_GENERATION)[number];

export const BORNES_GENERATION = {
  /** Plafond par génération (coût et temps de révision bornés ; CHECK en base). */
  nbMin: 1,
  nbMax: 20,
  focusMax: 200,
} as const;

export const MESSAGE_SUPPORT_HORS_MODULE = 'Support introuvable dans ce module.';
export const MESSAGE_AUCUN_SUPPORT_INDEXE =
  'Aucun support indexé pour ce module : déposez d’abord un support de cours et attendez la fin de son indexation.';
export const MESSAGE_SUPPORT_NON_INDEXE =
  'Ce support n’est pas indexé : choisissez un support au statut « Indexé ».';
export const MESSAGE_GENERATION_EN_COURS =
  'Une génération est déjà en cours : attendez qu’elle se termine avant d’en lancer une autre.';

/** Le support choisi, tel que les règles le voient. */
export interface SupportCible {
  moduleId: string;
  statut: StatutSupport;
}

/**
 * Le support doit appartenir au module (404 sinon, comme un support inconnu)
 * et être INDEXE (409). Quand le module n'a AUCUN support indexé, le message
 * invite d'abord à en indexer un (critère d'erreur du Backlog).
 */
export function verifierSupportGenerable(
  support: SupportCible | null,
  moduleId: string,
  nbSupportsIndexesDuModule: number,
): void {
  if (!support || support.moduleId !== moduleId) {
    throw new NotFoundException(MESSAGE_SUPPORT_HORS_MODULE);
  }
  if (support.statut !== StatutSupport.INDEXE) {
    throw new ConflictException(
      nbSupportsIndexesDuModule === 0 ? MESSAGE_AUCUN_SUPPORT_INDEXE : MESSAGE_SUPPORT_NON_INDEXE,
    );
  }
}

/** Types dans l'ordre de la liste de référence, sans doublon. */
export function normaliserTypes(types: readonly string[]): TypeGenerable[] {
  return TYPES_GENERABLES.filter((t) => types.includes(t));
}

/** Thème : espaces réduites ; vide -> null. */
export function nettoyerFocus(focus: string | undefined | null): string | null {
  const propre = (focus ?? '').replace(/\s+/g, ' ').trim();
  return propre ? propre.slice(0, BORNES_GENERATION.focusMax) : null;
}

/**
 * Plafond horaire par formateur (fenêtre fixe tenue dans Redis) : au-delà,
 * 429 avec le délai d'attente en minutes.
 */
export function verifierQuotaGenerations(
  compte: number,
  maximum: number,
  resteSecondes: number,
): void {
  if (compte <= maximum) return;
  const minutes = Math.max(1, Math.ceil(resteSecondes / 60));
  throw new HttpException(
    `Limite de ${maximum} générations par heure atteinte : réessayez dans ${minutes} min.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

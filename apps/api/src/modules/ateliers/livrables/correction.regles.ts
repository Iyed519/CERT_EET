import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';

/**
 * Règles PURES de la correction d'un livrable (US-ATEL-06, DS-03 partie 2,
 * UC5 Formateur) : aucune base, aucune horloge, aucune entrée/sortie.
 *
 * Unité des points : le POURCENTAGE des points du critère (0–100), la même
 * unité que les plages des niveaux (« Bon : 50–75 % »). La contribution d'un
 * critère au score est points × pondération / 100 ; le score de l'atelier est
 * la somme des contributions, sur 100.
 */

export const BORNES_NOTE = {
  pointsMin: 0,
  pointsMax: 100,
  decimales: 2,
  commentaireMax: 2000,
} as const;

export const MESSAGE_DEJA_EN_CORRECTION =
  'Ce livrable est déjà en correction : reprenez la correction en cours.';
export const MESSAGE_DEJA_NOTE =
  'Ce livrable est déjà noté : sa correction est finalisée et ne se modifie plus.';
export const MESSAGE_PAS_OUVERT =
  'Ouvrez d’abord la correction de ce livrable avant de noter ses critères.';

/** Ouvrir la correction : seul un livrable SOUMIS s'ouvre (409 sinon). */
export function verifierOuvrable(statut: StatutLivrable): void {
  if (statut === StatutLivrable.EN_CORRECTION) {
    throw new ConflictException(MESSAGE_DEJA_EN_CORRECTION);
  }
  if (statut !== StatutLivrable.SOUMIS) {
    throw new ConflictException(MESSAGE_DEJA_NOTE);
  }
}

/** Noter un critère : seul un livrable EN_CORRECTION se note (409 sinon). */
export function verifierNotable(statut: StatutLivrable): void {
  if (statut === StatutLivrable.SOUMIS) {
    throw new ConflictException(MESSAGE_PAS_OUVERT);
  }
  if (statut !== StatutLivrable.EN_CORRECTION) {
    throw new ConflictException(MESSAGE_DEJA_NOTE);
  }
}

/** Un niveau de performance d'un critère (plage en % du critère). */
export interface PlageNiveau {
  ordre: number;
  libelle: string;
  pointsMinPct: number;
  pointsMaxPct: number;
}

/**
 * Le niveau choisi doit exister pour ce critère, et les points tomber dans
 * sa plage, bornes comprises (les plages sont contiguës : 50 % est à la fois
 * la fin d'« Acceptable » et le début de « Bon », c'est le niveau choisi qui
 * tranche). Deux décimales au plus. Renvoie le niveau retenu.
 */
export function verifierPoints<N extends PlageNiveau>(
  niveaux: readonly N[],
  ordreNiveau: number,
  pointsPct: number,
): N {
  const niveau = niveaux.find((n) => n.ordre === ordreNiveau);
  if (!niveau) {
    throw new BadRequestException(
      'Niveau inconnu pour ce critère : choisissez un niveau de 1 (Insuffisant) à 4 (Excellent).',
    );
  }
  if (!Number.isFinite(pointsPct) || !aAuPlusDeuxDecimales(pointsPct)) {
    throw new BadRequestException(
      'Les points sont un pourcentage du critère, avec deux décimales au plus.',
    );
  }
  if (pointsPct < niveau.pointsMinPct || pointsPct > niveau.pointsMaxPct) {
    throw new BadRequestException(
      `Niveau « ${niveau.libelle} » : les points doivent être compris entre ` +
        `${niveau.pointsMinPct} % et ${niveau.pointsMaxPct} % du critère (reçu : ${pointsPct} %).`,
    );
  }
  return niveau;
}

/** Commentaire d'un critère : rogné ; vide -> null ; 2 000 caractères au plus. */
export function nettoyerCommentaireNote(texte: string | null | undefined): string | null {
  if (texte === undefined || texte === null) return null;
  const propre = texte.trim();
  if (propre.length === 0) return null;
  if (propre.length > BORNES_NOTE.commentaireMax) {
    throw new BadRequestException(
      `Le commentaire d’un critère ne dépasse pas ${BORNES_NOTE.commentaireMax} caractères.`,
    );
  }
  return propre;
}

/** Contribution d'un critère au score (sur 100), arrondie au centième. */
export function contribution(pointsPct: number, ponderation: number): number {
  return arrondi((pointsPct * ponderation) / 100);
}

/** Une note telle qu'elle compte dans le score. */
export interface NotePonderee {
  pointsPct: number;
  ponderation: number;
}

/**
 * Score pondéré (sur 100) des critères déjà notés : Σ points × pondération /
 * 100. Calculé en centièmes entiers pour ne pas accumuler d'erreur d'arrondi.
 */
export function scorePondere(notes: readonly NotePonderee[]): number {
  const centiemes = notes.reduce(
    (total, n) => total + Math.round(n.pointsPct * 100) * n.ponderation,
    0,
  );
  return arrondi(centiemes / 10000);
}

/** Avancement : critères notés / critères de la grille. */
export interface Avancement {
  notes: number;
  total: number;
  complete: boolean;
}

export function avancement(nbNotes: number, nbCriteres: number): Avancement {
  return { notes: nbNotes, total: nbCriteres, complete: nbCriteres > 0 && nbNotes === nbCriteres };
}

function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

function aAuPlusDeuxDecimales(valeur: number): boolean {
  return Math.abs(Math.round(valeur * 100) - valeur * 100) < 1e-6;
}

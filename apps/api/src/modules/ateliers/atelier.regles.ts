import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';

/**
 * Règles métier d'un atelier (US-ATEL-01, DS-13 partie 1).
 *
 * Fonctions pures, sans base ni horloge : le service leur passe l'heure de
 * PostgreSQL (`SELECT now()`). Une seule horloge décide, comme pour les QCM.
 */

/**
 * Extensions de livrable acceptées (liste fermée). US-ATEL-04 (dépôt sur
 * MinIO) refusera tout fichier dont l'extension n'est pas cochée sur
 * l'atelier. La migration reprend la même liste dans un CHECK
 * (1786400000000-ElargirTypesLivrables).
 *
 * Deux familles : documents et archives, puis fichiers de code source
 * (ajoutés le 08/11 : un atelier de programmation peut demander un fichier
 * `.py` ou `.java` seul, sans passer par un `.zip`). Les fichiers ne sont
 * jamais exécutés par la plateforme : stockés, puis téléchargés.
 */
export const EXTENSIONS_DOCUMENT = [
  'pdf',
  'zip',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'md',
  'png',
  'jpg',
] as const;
export const EXTENSIONS_CODE = [
  'js',
  'ts',
  'py',
  'java',
  'c',
  'cpp',
  'cs',
  'php',
  'sql',
  'html',
  'css',
  'json',
  'ipynb',
] as const;
export const EXTENSIONS_LIVRABLE = [...EXTENSIONS_DOCUMENT, ...EXTENSIONS_CODE] as const;
export type ExtensionLivrable = (typeof EXTENSIONS_LIVRABLE)[number];

/** Bornes partagées par les DTO, la migration et l'interface. */
export const BORNES_ATELIER = {
  titre: { min: 3, max: 200 },
  enonce: { min: 10, max: 20_000 },
  competencesMax: 2_000,
  tailleMaxMo: { min: 1, max: 100, defaut: 20 },
  nbMaxFichiers: { min: 1, max: 10, defaut: 1 },
  toleranceRetardHeures: { min: 0, max: 168, defaut: 0 },
} as const;

export const MESSAGE_DATE_PASSEE =
  'La date limite doit être dans le futur : une date déjà passée rendrait l’atelier impossible à rendre.';

/**
 * « Date limite dans le passé » (critère d'erreur du Backlog) : refus 400.
 * C'est la saisie qui est incohérente, pas l'état de l'atelier. Une date
 * ÉGALE à maintenant est déjà passée au moment où l'apprenant la lirait.
 */
export function verifierDateLimite(dateLimite: Date, maintenant: Date): void {
  if (Number.isNaN(dateLimite.getTime())) {
    throw new BadRequestException('La date limite est invalide.');
  }
  if (dateLimite.getTime() <= maintenant.getTime()) {
    throw new BadRequestException(MESSAGE_DATE_PASSEE);
  }
}

/**
 * Types de livrables : au moins un, tous dans la liste fermée. Je retire les
 * doublons et je range dans l'ordre de la liste, pour que deux saisies
 * équivalentes donnent la même valeur (et qu'un PATCH identique n'écrive rien).
 */
export function normaliserTypesLivrables(types: readonly string[]): ExtensionLivrable[] {
  const saisis = new Set(types.map((t) => t.trim().toLowerCase()));
  const inconnus = [...saisis].filter(
    (t) => !(EXTENSIONS_LIVRABLE as readonly string[]).includes(t),
  );
  if (inconnus.length > 0) {
    throw new BadRequestException(
      `Type de livrable non pris en charge : ${inconnus.join(', ')}. Types acceptés : ${EXTENSIONS_LIVRABLE.join(', ')}.`,
    );
  }
  const normalises = EXTENSIONS_LIVRABLE.filter((e) => saisis.has(e));
  if (normalises.length === 0) {
    throw new BadRequestException('Choisissez au moins un type de livrable.');
  }
  return normalises;
}

/**
 * Un atelier ne se modifie et ne se supprime qu'en BROUILLON (409 sinon :
 * c'est l'état qui bloque). Une fois publié (US-ATEL-03), les apprenants
 * s'appuient sur son énoncé et sa date limite.
 */
export function verifierModifiable(statut: StatutAtelier, action: 'modifier' | 'supprimer'): void {
  if (statut !== StatutAtelier.BROUILLON) {
    throw new ConflictException(
      action === 'modifier'
        ? 'Seul un atelier en brouillon peut être modifié.'
        : 'Seul un atelier en brouillon peut être supprimé.',
    );
  }
}

/** Ce que la publication vérifie, lu sous le verrou de l'atelier (US-ATEL-03). */
export interface EtatPublicationAtelier {
  statut: StatutAtelier;
  /** null : aucune grille n'a encore été commencée. */
  grilleValidee: boolean | null;
  dateLimite: Date;
}

export const MESSAGE_GRILLE_NON_VALIDEE =
  'Validez la grille de notation d’abord : la publication exige une grille validée (total de 100 %).';
export const MESSAGE_DATE_DEPASSEE_PUBLICATION =
  'La date limite de cet atelier est déjà passée : repoussez-la avant de le publier.';

/**
 * Un atelier peut-il être publié (US-ATEL-03, DS-13 partie 3) ? Ordre fixe :
 *   1. statut : déjà publié ou archivé -> 409 (c'est l'état qui bloque) ;
 *   2. grille absente ou non validée -> 409 (DS-13 dit 400 ; je garde la
 *      convention des refus d'état, comme la publication d'un QCM) ;
 *   3. date limite déjà passée (horloge PostgreSQL) -> 400, comme à la
 *      création (journal 36) : c'est la date saisie qu'il faut corriger.
 */
export function verifierPublicationAtelier(etat: EtatPublicationAtelier, maintenant: Date): void {
  if (etat.statut === StatutAtelier.PUBLIE) {
    throw new ConflictException('Cet atelier est déjà publié.');
  }
  if (etat.statut !== StatutAtelier.BROUILLON) {
    throw new ConflictException('Un atelier archivé ne peut pas être publié.');
  }
  if (etat.grilleValidee !== true) {
    throw new ConflictException(MESSAGE_GRILLE_NON_VALIDEE);
  }
  if (new Date(etat.dateLimite).getTime() <= maintenant.getTime()) {
    throw new BadRequestException(MESSAGE_DATE_DEPASSEE_PUBLICATION);
  }
}

/** Où en est le dépôt d'un atelier publié, vu de l'apprenant (informatif). */
export type EtatDepot = 'OUVERT' | 'EN_RETARD' | 'CLOS';

/**
 * Avant la date limite -> OUVERT ; ensuite, pendant la tolérance de retard ->
 * EN_RETARD (dépôt encore accepté, marqué en retard : US-ATEL-04) ; après ->
 * CLOS. Le dépôt lui-même sera revérifié par le serveur.
 */
export function etatDepot(
  dateLimite: Date | string,
  toleranceRetardHeures: number,
  maintenant: Date,
): EtatDepot {
  const limite = new Date(dateLimite).getTime();
  const t = maintenant.getTime();
  if (t < limite) return 'OUVERT';
  if (t < limite + toleranceRetardHeures * 3_600_000) return 'EN_RETARD';
  return 'CLOS';
}

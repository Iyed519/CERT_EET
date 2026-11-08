import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';

/**
 * Règles métier de la grille de notation (US-ATEL-02, DS-13 partie 2,
 * UC4 Formateur).
 *
 * Fonctions pures, sans base : le service les appelle SOUS VERROU (ligne de
 * l'atelier en FOR UPDATE), si bien que la somme lue est celle qui sera
 * écrite. Incohérence de la saisie = 400 ; état qui bloque = 409.
 */

/** Bornes partagées par les DTO, la migration et l'interface. */
export const BORNES_GRILLE = {
  intitule: { min: 3, max: 200 },
  descriptionMax: 2_000,
  descripteurMax: 1_000,
  ponderation: { min: 1, max: 100 },
  nomModele: { min: 3, max: 120 },
  // Chaque critère pèse au moins 1 % : 100 critères au plus en théorie ; je
  // borne plus bas, une grille lisible en compte rarement plus d'une dizaine.
  criteresMax: 20,
} as const;

/** Total exigé pour valider une grille. */
export const TOTAL_EXIGE = 100;

/** Les 4 niveaux, dans l'ordre (UC4 Formateur ; le rang fixe le libellé). */
export const LIBELLES_NIVEAUX = ['Insuffisant', 'Acceptable', 'Bon', 'Excellent'] as const;
export type LibelleNiveau = (typeof LIBELLES_NIVEAUX)[number];

/** Plages par défaut, en % des points du critère (exemple de l'UC4). */
export const PLAGES_PAR_DEFAUT: ReadonlyArray<{ min: number; max: number }> = [
  { min: 0, max: 25 },
  { min: 25, max: 50 },
  { min: 50, max: 75 },
  { min: 75, max: 100 },
];

/** Un niveau tel que saisi (plage en % du critère, descripteur facultatif). */
export interface NiveauSaisi {
  pointsMinPct: number;
  pointsMaxPct: number;
  descripteur?: string | null;
}

/** Un niveau prêt à écrire. */
export interface NiveauNormalise {
  ordre: number;
  libelle: LibelleNiveau;
  pointsMinPct: number;
  pointsMaxPct: number;
  descripteur: string | null;
}

/** Somme des pondérations (entiers). */
export function totalPonderations(ponderations: readonly number[]): number {
  return ponderations.reduce((somme, p) => somme + p, 0);
}

/**
 * Ajout ou modification d'un critère : le total doit rester ≤ 100 %
 * (« total validé en temps réel », Backlog). Au-delà : 400 avec le total
 * qu'aurait la grille, pour que le formateur sache de combien réduire.
 */
export function verifierPlafond(total: number): void {
  if (total > TOTAL_EXIGE) {
    throw new BadRequestException(
      `Total des pondérations : ${total} % (au-delà de ${TOTAL_EXIGE} %). Réduisez une pondération.`,
    );
  }
}

/**
 * Validation de la grille : au moins un critère et un total EXACTEMENT égal
 * à 100 % (critère d'erreur du Backlog : « validation refusée, message
 * explicite »). Une grille vide a un total de 0 %.
 */
export function verifierValidable(nbCriteres: number, total: number): void {
  if (nbCriteres === 0 || total !== TOTAL_EXIGE) {
    throw new BadRequestException(
      `Total des pondérations = ${total} % (doit être ${TOTAL_EXIGE} %).`,
    );
  }
}

/**
 * Les 4 niveaux d'un critère. Sans saisie : les plages par défaut, sans
 * descripteur. Avec saisie : exactement 4 niveaux, plages entières dans
 * 0–100, croissantes, CONTIGUËS (le minimum d'un niveau est le maximum du
 * précédent), la première commence à 0 et la dernière finit à 100 — ainsi
 * toute note de 0 à 100 % tombe dans un niveau, et un seul (bornes
 * partagées : US-ATEL-06 choisit le niveau d'abord, puis les points).
 */
export function normaliserNiveaux(saisis?: readonly NiveauSaisi[] | null): NiveauNormalise[] {
  if (saisis === undefined || saisis === null) {
    return PLAGES_PAR_DEFAUT.map((plage, i) => ({
      ordre: i + 1,
      libelle: LIBELLES_NIVEAUX[i],
      pointsMinPct: plage.min,
      pointsMaxPct: plage.max,
      descripteur: null,
    }));
  }
  if (saisis.length !== LIBELLES_NIVEAUX.length) {
    throw new BadRequestException(
      'Un critère compte exactement 4 niveaux : Insuffisant, Acceptable, Bon, Excellent.',
    );
  }
  saisis.forEach((niveau, i) => {
    const libelle = LIBELLES_NIVEAUX[i];
    const { pointsMinPct: min, pointsMaxPct: max } = niveau;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 100) {
      throw new BadRequestException(
        `Niveau « ${libelle} » : les plages sont des pourcentages entiers entre 0 et 100.`,
      );
    }
    if (min >= max) {
      throw new BadRequestException(
        `Niveau « ${libelle} » : le minimum (${min} %) doit être inférieur au maximum (${max} %).`,
      );
    }
    if (i === 0 && min !== 0) {
      throw new BadRequestException('Le niveau « Insuffisant » doit commencer à 0 %.');
    }
    if (i > 0 && min !== saisis[i - 1].pointsMaxPct) {
      throw new BadRequestException(
        `Les plages doivent se suivre sans trou ni chevauchement : « ${libelle} » doit commencer à ${saisis[i - 1].pointsMaxPct} %.`,
      );
    }
    if (i === saisis.length - 1 && max !== 100) {
      throw new BadRequestException('Le niveau « Excellent » doit finir à 100 %.');
    }
  });
  return saisis.map((niveau, i) => ({
    ordre: i + 1,
    libelle: LIBELLES_NIVEAUX[i],
    pointsMinPct: niveau.pointsMinPct,
    pointsMaxPct: niveau.pointsMaxPct,
    descripteur: texteOuNull(niveau.descripteur),
  }));
}

/**
 * La grille d'un atelier ne se modifie (critères, copie d'un modèle,
 * validation) que tant que l'atelier est en BROUILLON : une fois publié,
 * les apprenants la voient et US-ATEL-06 note avec. 409 : c'est l'état qui
 * bloque, pas la saisie.
 */
export function verifierGrilleModifiable(statut: StatutAtelier): void {
  if (statut !== StatutAtelier.BROUILLON) {
    throw new ConflictException('La grille ne se modifie que tant que l’atelier est en brouillon.');
  }
}

/**
 * Validité après une écriture : toute modification RÉELLE d'une grille
 * validée la remet à « non validée » (il faudra la revalider). Une écriture
 * sans effet ne change rien.
 */
export function valideeApres(valideeAvant: boolean, aChange: boolean): boolean {
  return aChange ? false : valideeAvant;
}

/** Plafond du nombre de critères (400 au-delà). */
export function verifierNombreCriteres(nbApresAjout: number): void {
  if (nbApresAjout > BORNES_GRILLE.criteresMax) {
    throw new BadRequestException(
      `Une grille compte au plus ${BORNES_GRILLE.criteresMax} critères.`,
    );
  }
}

/**
 * Réordonnancement : la liste reçue doit être une PERMUTATION exacte des
 * critères de la grille (ni oubli, ni doublon, ni intrus) — sinon 400.
 */
export function verifierPermutation(actuels: readonly string[], demandes: readonly string[]): void {
  const attendus = new Set(actuels);
  const recus = new Set(demandes);
  if (
    demandes.length !== actuels.length ||
    recus.size !== demandes.length ||
    demandes.some((id) => !attendus.has(id))
  ) {
    throw new BadRequestException(
      'L’ordre doit citer chaque critère de la grille exactement une fois.',
    );
  }
}

/**
 * Nom d'un modèle : rogné, 3–120 caractères APRÈS rognage. L'unicité (par
 * formateur, sans tenir compte de la casse) est vérifiée en base.
 */
export function nettoyerNomModele(nom: string): string {
  const propre = nom.trim().replace(/\s+/g, ' ');
  if (propre.length < BORNES_GRILLE.nomModele.min || propre.length > BORNES_GRILLE.nomModele.max) {
    throw new BadRequestException('Le nom du modèle doit contenir entre 3 et 120 caractères.');
  }
  return propre;
}

/**
 * Un modèle doit être COMPLET : au moins un critère et 100 % — on ne
 * réutilise pas une grille à moitié faite. (La copie dans un atelier reste
 * à valider, US-ATEL-02 D6.)
 */
export function verifierModeleComplet(nbCriteres: number, total: number): void {
  if (nbCriteres === 0 || total !== TOTAL_EXIGE) {
    throw new BadRequestException(
      `Seule une grille complète devient un modèle : total des pondérations = ${total} % (doit être ${TOTAL_EXIGE} %).`,
    );
  }
}

/** Texte facultatif : rogné, vide -> null. */
export function texteOuNull(texte: string | null | undefined): string | null {
  const propre = texte?.trim() ?? '';
  return propre.length > 0 ? propre : null;
}

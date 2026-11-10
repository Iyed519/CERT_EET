/**
 * Règles PURES de la période d'un tableau de bord (US-DASH-01, puis
 * US-SUIVI-01 et les rapports) : aucune base, aucune horloge, aucune
 * entrée/sortie. « Aujourd'hui » est fourni par l'appelant.
 *
 * Une période est un intervalle de JOURS CALENDAIRES inclusifs [du, au], au
 * format `AAAA-MM-JJ`, interprétés dans le fuseau de l'institution
 * (`FUSEAU_INSTITUTION`) au moment de la requête SQL.
 */

/** Fuseau des bornes de période (ESPRIT Entreprise, Tunis). */
export const FUSEAU_INSTITUTION = 'Africa/Tunis';

/** Période par défaut : les 30 derniers jours, aujourd'hui compris. */
export const JOURS_PAR_DEFAUT = 30;

/** Période la plus longue acceptée (une année bissextile). */
export const JOURS_MAX = 366;

export const MESSAGE_PERIODE_INVERSEE = 'La date de début doit précéder la date de fin.';
export const MESSAGE_PERIODE_TROP_LONGUE = `La période ne peut pas dépasser ${JOURS_MAX} jours.`;
export const MESSAGE_DATE_INVALIDE = 'Date invalide (format attendu : AAAA-MM-JJ).';

export interface Periode {
  /** Premier jour inclus (AAAA-MM-JJ). */
  du: string;
  /** Dernier jour inclus (AAAA-MM-JJ). */
  au: string;
  /** Nombre de jours de la période (≥ 1). */
  jours: number;
}

/** Erreur de période (traduite en 400 par l'appelant). */
export class PeriodeInvalide extends Error {}

const FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;

/** `AAAA-MM-JJ` -> millisecondes UTC de minuit, ou null si la date n'existe pas. */
export function versJour(texte: string): number | null {
  if (!FORMAT.test(texte)) return null;
  const ms = Date.parse(`${texte}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Refuse les dates « normalisées » (2026-02-30 -> 2026-03-02).
  return new Date(ms).toISOString().slice(0, 10) === texte ? ms : null;
}

/** Millisecondes UTC de minuit -> `AAAA-MM-JJ`. */
export function versTexte(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Décale une date `AAAA-MM-JJ` de `n` jours. */
export function decaler(texte: string, n: number): string {
  const ms = versJour(texte);
  if (ms === null) throw new PeriodeInvalide(MESSAGE_DATE_INVALIDE);
  return versTexte(ms + n * JOUR_MS);
}

/**
 * Résout la période demandée :
 * - rien : les `JOURS_PAR_DEFAUT` derniers jours, aujourd'hui compris ;
 * - `au` seul : les `JOURS_PAR_DEFAUT` jours se terminant à `au` ;
 * - `du` seul : de `du` à aujourd'hui (ou `du` si `du` est dans le futur :
 *   période d'un jour, vide de données mais valide) ;
 * - `du` > `au` : refus ; plus de `JOURS_MAX` jours : refus.
 */
export function resoudrePeriode(
  aujourdhui: string,
  du?: string | null,
  au?: string | null,
): Periode {
  if (versJour(aujourdhui) === null) throw new PeriodeInvalide(MESSAGE_DATE_INVALIDE);
  if (du && versJour(du) === null) throw new PeriodeInvalide(MESSAGE_DATE_INVALIDE);
  if (au && versJour(au) === null) throw new PeriodeInvalide(MESSAGE_DATE_INVALIDE);

  let fin = au || null;
  let debut = du || null;
  if (!fin) fin = debut && debut > aujourdhui ? debut : aujourdhui;
  if (!debut) debut = decaler(fin, -(JOURS_PAR_DEFAUT - 1));
  if (debut > fin) throw new PeriodeInvalide(MESSAGE_PERIODE_INVERSEE);

  const jours = Math.round(((versJour(fin) as number) - (versJour(debut) as number)) / JOUR_MS) + 1;
  if (jours > JOURS_MAX) throw new PeriodeInvalide(MESSAGE_PERIODE_TROP_LONGUE);
  return { du: debut, au: fin, jours };
}

/** La date du jour dans le fuseau de l'institution (`AAAA-MM-JJ`). */
export function aujourdhuiInstitution(maintenant: Date = new Date()): string {
  // Le format suédois (sv-SE) produit exactement AAAA-MM-JJ.
  return maintenant.toLocaleDateString('sv-SE', { timeZone: FUSEAU_INSTITUTION });
}

/** Moyenne arrondie à 2 décimales, ou null s'il n'y a rien à moyenner. */
export function arrondi2(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Taux en pourcentage arrondi à 1 décimale ; 0 si le dénominateur est nul. */
export function taux(numerateur: number, denominateur: number): number {
  if (denominateur <= 0) return 0;
  return Math.round((numerateur / denominateur) * 1000) / 10;
}

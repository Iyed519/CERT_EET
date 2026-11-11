/**
 * US-FORM-08 — Règles PURES des propositions de formation (aucune base, aucune
 * horloge). La base garde les mêmes bornes en contraintes CHECK (filet).
 */

export type StatutProposition = 'EN_ATTENTE' | 'A_MODIFIER' | 'ACCEPTEE' | 'REFUSEE';

export const STATUTS_PROPOSITION: StatutProposition[] = [
  'EN_ATTENTE',
  'A_MODIFIER',
  'ACCEPTEE',
  'REFUSEE',
];

/** Propositions ouvertes (en attente d'une décision ou d'une correction) au plus. */
export const MAX_PROPOSITIONS_OUVERTES = 5;

export const TEXTE_MIN = 10;
export const TEXTE_MAX = 1000;

/** Seuil de certification d'une formation créée depuis une proposition (modifiable ensuite). */
export const NOTE_MIN_PAR_DEFAUT = 60;

export const MESSAGE_MOTIF = `Le motif doit compter entre ${TEXTE_MIN} et ${TEXTE_MAX} caractères.`;
export const MESSAGE_COMMENTAIRE = `Le commentaire doit compter entre ${TEXTE_MIN} et ${TEXTE_MAX} caractères.`;
export const MESSAGE_TROP_DE_PROPOSITIONS = `Vous avez déjà ${MAX_PROPOSITIONS_OUVERTES} propositions en cours : attendez une décision avant d'en envoyer une autre.`;
export const MESSAGE_NON_MODIFIABLE =
  'Cette proposition ne peut plus être modifiée : elle a déjà été acceptée ou refusée.';
export const MESSAGE_DEJA_TRAITEE = "Cette proposition n'attend pas de décision.";
export const MESSAGE_FORMATEUR_INACTIF =
  "Le formateur n'est plus actif : la proposition ne peut pas être acceptée.";

/** Texte libre borné (motif, commentaire) une fois les blancs de bord retirés. */
export function texteValide(texte: string | null | undefined): boolean {
  if (typeof texte !== 'string') return false;
  const n = texte.trim().length;
  return n >= TEXTE_MIN && n <= TEXTE_MAX;
}

/** Une proposition compte dans la limite tant qu'elle attend quelqu'un. */
export function ouverte(statut: string): boolean {
  return statut === 'EN_ATTENTE' || statut === 'A_MODIFIER';
}

/** Une nouvelle proposition est-elle permise avec ce nombre de propositions ouvertes ? */
export function creationPermise(nbOuvertes: number): boolean {
  return nbOuvertes < MAX_PROPOSITIONS_OUVERTES;
}

/** Le formateur modifie (et resoumet) tant qu'aucune décision finale n'est prise. */
export function modifiableParLeFormateur(statut: string): boolean {
  return ouverte(statut);
}

/** L'administrateur ne décide que sur une proposition EN_ATTENTE. */
export function decidable(statut: string): boolean {
  return statut === 'EN_ATTENTE';
}

/** Description de la formation créée : la description, puis le public visé. */
export function descriptionFormation(
  description: string | null,
  publicVise: string | null,
): string | null {
  const morceaux = [description?.trim(), publicVise?.trim() ? `Public visé : ${publicVise.trim()}` : null]
    .filter((m): m is string => Boolean(m));
  return morceaux.length ? morceaux.join('\n\n') : null;
}

import { DIMENSION_EMBEDDINGS, FournisseurEmbeddings } from './fournisseur-embeddings';

/**
 * Embeddings LEXICAUX par hachage de caractéristiques (« feature hashing »),
 * calculés dans le processus de l'api — aucune clé, aucun réseau, aucun
 * modèle à télécharger, résultat déterministe (tests et CI reproductibles).
 *
 * Pourquoi celui-ci d'abord (journal 49, décision D2) : le modèle neuronal
 * prévu (multilingual-e5-small via transformers.js) n'a pas pu être vérifié —
 * le dépôt de modèles est injoignable depuis l'espace de travail, et l'image
 * de l'api (node:20-alpine, musl) n'est pas prise en charge par le moteur
 * ONNX natif. Ce fournisseur tient l'interface ; un fournisseur neuronal de
 * même dimension (384) se branchera sans changer le schéma.
 *
 * Méthode (fonctions PURES) :
 *  1. normalisation : minuscules, accents retirés, ponctuation -> espace ;
 *  2. mots de 2 lettres ou plus hors mots vides (français, anglais),
 *     pluriel simple retiré (« questions » -> « question ») ;
 *  3. caractéristiques : chaque mot (poids 1), chaque paire de mots voisins
 *     (0,5), chaque trigramme de lettres du mot (0,25 — rapproche « sécurité »
 *     et « sécuriser ») ;
 *  4. hachage FNV-1a 32 bits -> case (modulo 384) et signe (bit de poids
 *     fort) : les collisions se compensent en moyenne ;
 *  5. poids amorti ln(1 + tf) — toujours positif, même pour les poids
 *     fractionnaires des trigrammes —, puis normalisation L2.
 * La similarité cosinus de deux vecteurs mesure alors le recouvrement de
 * vocabulaire entre deux passages, ce qui suffit à retrouver dans UN support
 * les passages qui parlent du thème demandé.
 */
export const MODELE_HACHAGE = 'hachage-lexical-v1';

const MOTS_VIDES = new Set(
  (
    'au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur leurs ' +
    'lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses ' +
    'son sur ta te tes toi ton tu un une vos votre vous est sont ete etre avoir ont fait comme ' +
    'plus ainsi donc car si tout tous toute toutes aussi entre sans sous chez vers apres avant ' +
    'the of and to in is are be for on with as by at or an it this that from which was were'
  ).split(' '),
);

/** Minuscules, accents retirés, tout ce qui n'est pas lettre ou chiffre -> espace. */
export function normaliserPourHachage(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mots significatifs, pluriel simple retiré. */
export function motsSignificatifs(texte: string): string[] {
  const normalise = normaliserPourHachage(texte);
  if (!normalise) return [];
  return normalise
    .split(' ')
    .filter((m) => m.length >= 2 && !MOTS_VIDES.has(m))
    .map((m) => (m.length > 4 && /[sx]$/.test(m) ? m.slice(0, -1) : m));
}

/** FNV-1a 32 bits (non signé). */
export function fnv1a(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Vecteur normé d'un texte (dimension 384). Texte sans mot -> axe 0. */
export function vecteurHachage(texte: string): number[] {
  const poids = new Map<string, number>();
  const ajouter = (cle: string, p: number): void => {
    poids.set(cle, (poids.get(cle) ?? 0) + p);
  };
  const mots = motsSignificatifs(texte);
  mots.forEach((mot, i) => {
    ajouter(`m:${mot}`, 1);
    if (i > 0) ajouter(`b:${mots[i - 1]} ${mot}`, 0.5);
    const borde = `^${mot}$`;
    for (let j = 0; j + 3 <= borde.length; j++) ajouter(`t:${borde.slice(j, j + 3)}`, 0.25);
  });

  const vecteur = new Array<number>(DIMENSION_EMBEDDINGS).fill(0);
  for (const [cle, tf] of poids) {
    const h = fnv1a(cle);
    const signe = h & 0x80000000 ? -1 : 1;
    vecteur[h % DIMENSION_EMBEDDINGS] += signe * Math.log1p(tf);
  }
  const norme = Math.sqrt(vecteur.reduce((s, v) => s + v * v, 0));
  if (norme === 0) {
    // Vecteur nul interdit (cosinus indéfini) : axe conventionnel.
    vecteur[0] = 1;
    return vecteur;
  }
  return vecteur.map((v) => v / norme);
}

/** Similarité cosinus de deux vecteurs normés (produit scalaire). */
export function cosinus(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export class EmbeddingsHachage implements FournisseurEmbeddings {
  readonly modele = MODELE_HACHAGE;

  // Le même calcul sert aux passages et aux requêtes (modèle symétrique) :
  // l'usage, prévu par l'interface pour les modèles asymétriques, est ignoré.
  async vectoriser(textes: readonly string[]): Promise<number[][]> {
    return textes.map((t) => vecteurHachage(t));
  }
}

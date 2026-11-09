/**
 * Découpage du texte d'un support en passages (US-IA-01, DS-06 : « chunks de
 * 512 tokens, overlap 50 »). Règles PURES.
 *
 * Je compte en CARACTÈRES, pas en tokens : un tokenizer dépend du modèle, et
 * le modèle d'embeddings est interchangeable (ADR-05). En français, un token
 * fait environ 4 caractères ; 512 tokens ≈ 2 000 caractères et 50 tokens ≈
 * 200 caractères. Les coupes tombent de préférence entre deux paragraphes,
 * sinon en fin de phrase, sinon sur une espace — jamais au milieu d'un mot
 * quand c'est évitable.
 */
export const DECOUPAGE = {
  tailleCaracteres: 2000,
  chevauchementCaracteres: 200,
  /** Au-delà (≈ 4 millions de caractères), le support est refusé à l'indexation. */
  segmentsMax: 2000,
  /** En dessous, le texte n'est pas exploitable (PDF scanné, fichier vide). */
  caracteresMin: 50,
} as const;

/**
 * Texte brut -> texte propre : fins de ligne unifiées, caractères de contrôle
 * retirés, césures de fin de ligne recollées (« sécu-\nrité »), espaces
 * réduites, trois sauts de ligne ou plus ramenés à deux (paragraphe).
 */
export function normaliserTexte(brut: string): string {
  return brut
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­﻿]/g, '')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Nombre de caractères « utiles » (hors espaces). */
export function caracteresUtiles(texte: string): number {
  return texte.replace(/\s+/g, '').length;
}

/** Meilleure position de coupe dans [min, max] (fin exclue), ou max. */
function positionDeCoupe(texte: string, min: number, max: number): number {
  const fenetre = texte.slice(min, max);
  const paragraphe = fenetre.lastIndexOf('\n\n');
  if (paragraphe >= 0) return min + paragraphe + 2;
  let phrase = -1;
  for (const m of fenetre.matchAll(/[.!?…:;](?=\s)/g)) phrase = (m.index ?? 0) + 1;
  if (phrase > 0) return min + phrase;
  const espace = Math.max(fenetre.lastIndexOf(' '), fenetre.lastIndexOf('\n'));
  if (espace > 0) return min + espace + 1;
  return max;
}

/**
 * Découpe un texte NORMALISÉ en passages d'environ `taille` caractères, chacun
 * reprenant les `chevauchement` derniers caractères du précédent (contexte
 * préservé entre deux passages). Toujours en progression : la boucle termine.
 */
export function decouper(
  texte: string,
  taille: number = DECOUPAGE.tailleCaracteres,
  chevauchement: number = DECOUPAGE.chevauchementCaracteres,
): string[] {
  const passages: string[] = [];
  const longueur = texte.length;
  let debut = 0;
  while (debut < longueur) {
    let fin = Math.min(debut + taille, longueur);
    if (fin < longueur) {
      fin = positionDeCoupe(texte, debut + Math.floor(taille * 0.6), fin);
    }
    const passage = texte.slice(debut, fin).trim();
    if (passage) passages.push(passage);
    if (fin >= longueur) break;
    // Reprise `chevauchement` caractères plus tôt, calée sur un début de mot.
    let suivant = Math.max(fin - chevauchement, debut + 1);
    const espace = texte.slice(suivant, fin).search(/\s/);
    if (espace >= 0 && suivant + espace + 1 < fin) suivant += espace + 1;
    debut = suivant;
  }
  return passages;
}

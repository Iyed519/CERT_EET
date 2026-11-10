/**
 * US-INSC-02 — Règles PURES de l'import CSV d'inscriptions (administrateur).
 *
 * Fichier : une adresse email par ligne (première colonne ; séparateur `;`
 * ou `,`), en-tête « email » facultatif, lignes vides ignorées, BOM toléré.
 * Bornes : 64 Ko et 500 lignes de données au plus (400 au-delà) — un import
 * reste une opération d'administration, pas une migration de masse.
 */

export const BORNES_IMPORT = { tailleMaxOctets: 64 * 1024, lignesMax: 500 } as const;

export const MESSAGE_IMPORT_VIDE = 'Le fichier ne contient aucune adresse email.';
export const MESSAGE_IMPORT_TROP_LONG = `Le fichier dépasse ${BORNES_IMPORT.lignesMax} lignes : découpez-le.`;
export const MESSAGE_IMPORT_TROP_GROS = 'Le fichier dépasse 64 Ko, la taille maximale.';
export const MESSAGE_IMPORT_ENCODAGE = 'Le fichier doit être un texte UTF-8 (CSV).';

/** Résultat d'une ligne de l'import (rapport ligne par ligne). */
export type ResultatLigne =
  | 'INSCRIT'
  | 'DEJA_INSCRIT'
  | 'INSCRIPTION_SUSPENDUE'
  | 'COMPTE_INCONNU'
  | 'PAS_APPRENANT'
  | 'COMPTE_INACTIF'
  | 'EMAIL_INVALIDE'
  | 'DOUBLON'
  | 'COMPLET';

export const LIBELLES_RESULTAT: Record<ResultatLigne, string> = {
  INSCRIT: 'Inscrit',
  DEJA_INSCRIT: 'Déjà inscrit',
  INSCRIPTION_SUSPENDUE: 'Inscription suspendue : réactivez-la',
  COMPTE_INCONNU: 'Aucun compte avec cette adresse',
  PAS_APPRENANT: 'Ce compte n’est pas un apprenant',
  COMPTE_INACTIF: 'Compte non actif',
  EMAIL_INVALIDE: 'Adresse email invalide',
  DOUBLON: 'Adresse déjà présente plus haut dans le fichier',
  COMPLET: 'Formation complète',
};

/** Une ligne de données : numéro dans le fichier (1 = première ligne) et email. */
export interface LigneImport {
  ligne: number;
  email: string;
}

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export function emailValide(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email);
}

/**
 * Découpe le fichier en lignes de données. Lève une erreur (message
 * français) si le fichier est vide, trop long ou n'est pas du texte.
 */
export function lireFichier(tampon: Buffer): LigneImport[] {
  if (tampon.length > BORNES_IMPORT.tailleMaxOctets) throw new Error(MESSAGE_IMPORT_TROP_GROS);
  const texte = tampon.toString('utf8');
  if (texte.includes('�') || texte.includes('\u0000')) throw new Error(MESSAGE_IMPORT_ENCODAGE);
  const lignes: LigneImport[] = [];
  texte
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .forEach((brute, i) => {
      const premiere = brute
        .split(/[;,]/)[0]
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .trim();
      if (premiere === '') return;
      if (lignes.length === 0 && i === 0 && /^e-?mail$/i.test(premiere)) return;
      lignes.push({ ligne: i + 1, email: premiere.toLowerCase() });
    });
  if (lignes.length === 0) throw new Error(MESSAGE_IMPORT_VIDE);
  if (lignes.length > BORNES_IMPORT.lignesMax) throw new Error(MESSAGE_IMPORT_TROP_LONG);
  return lignes;
}

/** Compte du rapport par résultat (toutes les clés présentes). */
export function bilan(
  resultats: Array<{ resultat: ResultatLigne }>,
): Record<ResultatLigne, number> {
  const b = Object.fromEntries(
    (Object.keys(LIBELLES_RESULTAT) as ResultatLigne[]).map((k) => [k, 0]),
  ) as Record<ResultatLigne, number>;
  for (const r of resultats) b[r.resultat] += 1;
  return b;
}

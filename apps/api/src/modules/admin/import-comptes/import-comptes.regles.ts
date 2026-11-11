/**
 * US-CPT-02 — Règles PURES de l'import CSV de comptes par l'administrateur.
 *
 * Fichier : une ligne d'en-tête OBLIGATOIRE nommant les colonnes (ordre libre,
 * casse et accents indifférents) — `email`, `nom`, `prenom` obligatoires,
 * `role` facultative (APPRENANT par défaut, ou FORMATEUR) ; séparateur `;` ou
 * `,` (déduit de l'en-tête) ; champs entre guillemets acceptés (« "" » pour un
 * guillemet) ; BOM toléré ; lignes vides ignorées.
 * Bornes : 256 Ko et 500 comptes au plus.
 *
 * Tout est validé AVANT la moindre création : la moindre ligne en erreur
 * bloque l'import entier (tout ou rien), avec le rapport ligne par ligne.
 */
import { Role } from '../../../database/enums/role.enum';

export const BORNES_IMPORT_COMPTES = { tailleMaxOctets: 256 * 1024, lignesMax: 500 } as const;

export const COLONNES_OBLIGATOIRES = ['email', 'nom', 'prenom'] as const;
export const ROLES_IMPORTABLES: readonly Role[] = [Role.APPRENANT, Role.FORMATEUR];
const LONGUEUR_MAX_NOM = 100;

export const MESSAGE_FICHIER_VIDE = 'Le fichier ne contient aucun compte.';
export const MESSAGE_TROP_DE_LIGNES = `Le fichier dépasse ${BORNES_IMPORT_COMPTES.lignesMax} comptes : découpez-le.`;
export const MESSAGE_TROP_GROS = 'Le fichier dépasse 256 Ko, la taille maximale.';
export const MESSAGE_ENCODAGE = 'Le fichier doit être un texte UTF-8 (CSV).';
export const MESSAGE_GUILLEMETS = 'Guillemet non refermé dans le fichier.';

export type ErreurLigne =
  | 'EMAIL_INVALIDE'
  | 'NOM_MANQUANT'
  | 'PRENOM_MANQUANT'
  | 'CHAMP_TROP_LONG'
  | 'ROLE_INVALIDE'
  | 'DOUBLON_FICHIER'
  | 'COMPTE_EXISTANT';

export const LIBELLES_ERREUR: Record<ErreurLigne, string> = {
  EMAIL_INVALIDE: 'Adresse email invalide',
  NOM_MANQUANT: 'Nom manquant',
  PRENOM_MANQUANT: 'Prénom manquant',
  CHAMP_TROP_LONG: `Nom ou prénom de plus de ${LONGUEUR_MAX_NOM} caractères`,
  ROLE_INVALIDE: 'Rôle invalide (APPRENANT ou FORMATEUR)',
  DOUBLON_FICHIER: 'Adresse déjà présente plus haut dans le fichier',
  COMPTE_EXISTANT: 'Un compte existe déjà avec cette adresse',
};

/** Ligne de données lue dans le fichier (numéro de ligne réel, 1 = en-tête). */
export interface LigneCompte {
  ligne: number;
  email: string;
  nom: string;
  prenom: string;
  role: string;
}

/** Ligne validée, prête à être créée. */
export interface CompteAImporter {
  ligne: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
}

export interface ErreurRapport {
  ligne: number;
  email: string;
  erreurs: ErreurLigne[];
  libelles: string[];
}

/** Erreur de structure du fichier (400 sans rapport ligne par ligne). */
export class FichierImportInvalide extends Error {}

const EMAIL = /^[^\s@;,"]+@[^\s@;,"]+\.[^\s@;,"]+$/;

export function emailValide(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email);
}

/** « Prénom » -> « prenom » : comparaison des en-têtes sans casse ni accent. */
export function normaliserEntete(valeur: string): string {
  return valeur.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * Découpe un texte CSV en enregistrements (RFC 4180 : guillemets, guillemets
 * doublés, retours à la ligne dans un champ entre guillemets). Chaque
 * enregistrement garde le numéro de sa première ligne physique.
 */
export function decouperCsv(
  texte: string,
  separateur: string,
): Array<{ ligne: number; champs: string[] }> {
  const enregistrements: Array<{ ligne: number; champs: string[] }> = [];
  let champs: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  let ligne = 1;
  let debut = 1;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else {
          entreGuillemets = false;
        }
      } else {
        if (c === '\n') ligne += 1;
        champ += c;
      }
      continue;
    }
    if (c === '"' && champ.trim() === '') {
      champ = '';
      entreGuillemets = true;
    } else if (c === separateur) {
      champs.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      champs.push(champ);
      enregistrements.push({ ligne: debut, champs });
      champs = [];
      champ = '';
      ligne += 1;
      debut = ligne;
    } else {
      champ += c;
    }
  }
  if (entreGuillemets) throw new FichierImportInvalide(MESSAGE_GUILLEMETS);
  champs.push(champ);
  enregistrements.push({ ligne: debut, champs });
  return enregistrements.filter((e) => e.champs.some((f) => f.trim() !== ''));
}

/**
 * Lit le fichier : encodage, bornes, en-tête et colonnes obligatoires. Lève
 * `FichierImportInvalide` (message français) pour un fichier inexploitable.
 */
export function lireFichierComptes(tampon: Buffer): LigneCompte[] {
  if (tampon.length > BORNES_IMPORT_COMPTES.tailleMaxOctets) {
    throw new FichierImportInvalide(MESSAGE_TROP_GROS);
  }
  const texte = tampon.toString('utf8').replace(/^﻿/, '');
  if (texte.includes('�') || texte.includes('\u0000')) {
    throw new FichierImportInvalide(MESSAGE_ENCODAGE);
  }
  const premiereLigne = texte.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const separateur =
    (premiereLigne.match(/;/g)?.length ?? 0) >= (premiereLigne.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';
  const enregistrements = decouperCsv(texte, separateur);
  if (enregistrements.length === 0) throw new FichierImportInvalide(MESSAGE_FICHIER_VIDE);
  const entete = enregistrements[0].champs.map(normaliserEntete);
  const manquantes = COLONNES_OBLIGATOIRES.filter((c) => !entete.includes(c));
  if (manquantes.length > 0) {
    throw new FichierImportInvalide(
      `Colonne(s) obligatoire(s) absente(s) de l'en-tête : ${manquantes.join(', ')}. ` +
        `En-tête attendu : email;nom;prenom;role (role facultative).`,
    );
  }
  const index = (nom: string): number => entete.indexOf(nom);
  const lignes = enregistrements.slice(1).map((e) => {
    const lire = (nom: string): string => {
      const i = index(nom);
      return i >= 0 ? (e.champs[i] ?? '').trim() : '';
    };
    return {
      ligne: e.ligne,
      email: lire('email').toLowerCase(),
      nom: lire('nom'),
      prenom: lire('prenom'),
      role: lire('role').toUpperCase(),
    };
  });
  if (lignes.length === 0) throw new FichierImportInvalide(MESSAGE_FICHIER_VIDE);
  if (lignes.length > BORNES_IMPORT_COMPTES.lignesMax) {
    throw new FichierImportInvalide(MESSAGE_TROP_DE_LIGNES);
  }
  return lignes;
}

/**
 * Valide chaque ligne (format, doublons dans le fichier, comptes déjà en
 * base). `existants` : adresses (en minuscules) qui ont déjà un compte.
 */
export function validerLignes(
  lignes: LigneCompte[],
  existants: ReadonlySet<string>,
): { valides: CompteAImporter[]; erreurs: ErreurRapport[] } {
  const vues = new Set<string>();
  const valides: CompteAImporter[] = [];
  const erreurs: ErreurRapport[] = [];
  for (const l of lignes) {
    const e: ErreurLigne[] = [];
    if (!emailValide(l.email)) e.push('EMAIL_INVALIDE');
    if (l.nom === '') e.push('NOM_MANQUANT');
    if (l.prenom === '') e.push('PRENOM_MANQUANT');
    if (l.nom.length > LONGUEUR_MAX_NOM || l.prenom.length > LONGUEUR_MAX_NOM) {
      e.push('CHAMP_TROP_LONG');
    }
    const role = l.role === '' ? Role.APPRENANT : (l.role as Role);
    if (!ROLES_IMPORTABLES.includes(role)) e.push('ROLE_INVALIDE');
    if (l.email !== '' && vues.has(l.email)) e.push('DOUBLON_FICHIER');
    else if (existants.has(l.email)) e.push('COMPTE_EXISTANT');
    vues.add(l.email);
    if (e.length > 0) {
      erreurs.push({
        ligne: l.ligne,
        email: l.email,
        erreurs: e,
        libelles: e.map((x) => LIBELLES_ERREUR[x]),
      });
    } else {
      valides.push({ ligne: l.ligne, email: l.email, nom: l.nom, prenom: l.prenom, role });
    }
  }
  return { valides, erreurs };
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EXTENSIONS_LIVRABLE, ExtensionLivrable } from '../atelier.regles';

/**
 * Règles métier du dépôt d'un livrable (US-ATEL-04, DS-03 partie 1, UC4
 * Apprenant). Fonctions pures : ni base, ni horloge, ni disque — le service
 * leur passe l'heure de PostgreSQL et les premiers octets de chaque fichier.
 */

/** Bornes partagées par les règles, le DTO et la migration. */
export const BORNES_LIVRABLE = {
  commentaireMax: 2_000,
  liensMax: 5,
  lienLongueurMax: 500,
  nomFichierMax: 255,
  /** Plafond absolu par fichier (celui de l'atelier est ≤ 100 Mo). */
  tailleAbsolueMaxOctets: 100 * 1024 * 1024,
  fichiersAbsolusMax: 10,
} as const;

const MO = 1024 * 1024;

export const MESSAGE_DEPOT_CLOS =
  'La date limite de dépôt est dépassée : cet atelier n’accepte plus de livrable.';
export const MESSAGE_DEJA_SOUMIS =
  'Vous avez déjà soumis un livrable pour cet atelier : remplacez-le plutôt (avant la date limite).';

/**
 * Le dépôt est-il encore ouvert à `maintenant` (heure de PostgreSQL à la
 * réception) ? Avant la date limite (exclue) : à l'heure. Pendant la
 * tolérance : accepté, marqué en retard. Ensuite : 409 — c'est le temps qui
 * bloque (DS-03 dit 403 ; convention du projet : refus d'état ou de temps =
 * 409, comme la fenêtre d'un QCM).
 */
export function verifierDelaiDepot(
  dateLimite: Date | string,
  toleranceRetardHeures: number,
  maintenant: Date,
): { enRetard: boolean } {
  const limite = new Date(dateLimite).getTime();
  const t = maintenant.getTime();
  if (t < limite) return { enRetard: false };
  if (t < limite + toleranceRetardHeures * 3_600_000) return { enRetard: true };
  throw new ConflictException(MESSAGE_DEPOT_CLOS);
}

// US-ATEL-05 — Remplacer son livrable.
export const MESSAGE_AUCUN_LIVRABLE =
  'Vous n’avez pas encore déposé de livrable pour cet atelier : déposez-en un d’abord.';
export const MESSAGE_REMPLACEMENT_CLOS =
  'La date limite est passée : votre livrable ne peut plus être remplacé.';
export const MESSAGE_REMPLACEMENT_EN_CORRECTION =
  'Votre livrable est en cours de correction : il ne peut plus être remplacé.';
export const MESSAGE_REMPLACEMENT_NOTE =
  'Votre livrable a été noté : il ne peut plus être remplacé.';
export const MESSAGE_REMPLACEMENT_CONCURRENT =
  'Votre livrable vient d’être modifié par une autre demande : rechargez la page puis réessayez.';

/**
 * Le livrable peut-il être remplacé à `maintenant` (heure de PostgreSQL) ?
 * Seulement SOUMIS (ni en correction, ni noté) et AVANT la date limite
 * (exclue) : la tolérance de retard ne vaut que pour le premier dépôt. 409
 * sinon (refus d'état ou de temps, convention du projet).
 */
export function verifierRemplacement(
  statut: string,
  dateLimite: Date | string,
  maintenant: Date,
): void {
  if (statut === 'EN_CORRECTION') throw new ConflictException(MESSAGE_REMPLACEMENT_EN_CORRECTION);
  if (statut !== 'SOUMIS') throw new ConflictException(MESSAGE_REMPLACEMENT_NOTE);
  if (maintenant.getTime() >= new Date(dateLimite).getTime()) {
    throw new ConflictException(MESSAGE_REMPLACEMENT_CLOS);
  }
}

/** Un fichier reçu, tel que le service le décrit aux règles. */
export interface FichierRecu {
  nom: string;
  taille: number;
  /** Les premiers octets du fichier (au moins 8 si le fichier en a autant). */
  entete: Buffer;
}

/** Ce que l'atelier impose. */
export interface ModalitesDepot {
  typesLivrables: readonly string[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
}

/** Extension d'un nom de fichier, en minuscules, sans le point ('' si aucune). */
export function extensionDe(nom: string): string {
  const base = nom.trim();
  const point = base.lastIndexOf('.');
  if (point <= 0 || point === base.length - 1) return '';
  return base.slice(point + 1).toLowerCase();
}

/**
 * Signatures (« nombres magiques ») des formats binaires : un fichier renommé
 * en `.pdf` sans en être un est refusé. Les formats texte (code, md, txt,
 * json…) n'ont pas de signature : seule l'extension compte. Les formats
 * Office récents (docx, pptx, xlsx) sont des archives ZIP.
 */
const SIGNATURES: Partial<Record<ExtensionLivrable, number[][]>> = {
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  zip: [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06], // archive vide
  ],
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpg: [[0xff, 0xd8, 0xff]],
};

export function signatureConforme(extension: string, entete: Buffer): boolean {
  const attendues = SIGNATURES[extension as ExtensionLivrable];
  if (!attendues) return true;
  return attendues.some(
    (sig) => entete.length >= sig.length && sig.every((octet, i) => entete[i] === octet),
  );
}

/**
 * Vérifie les fichiers contre les modalités de l'atelier, dans cet ordre
 * (400, rien n'est enregistré — critère d'erreur du Backlog) :
 *   1. au moins un fichier, pas plus que le maximum de l'atelier ;
 *   2. pour chaque fichier : nom présent et ≤ 255 caractères, extension
 *      acceptée par l'atelier (liste rappelée), fichier non vide, taille ≤
 *      maximum de l'atelier, signature conforme à l'extension.
 * Renvoie l'extension normalisée de chaque fichier, dans l'ordre reçu.
 */
export function verifierFichiers(
  fichiers: readonly FichierRecu[],
  modalites: ModalitesDepot,
): ExtensionLivrable[] {
  if (fichiers.length === 0) {
    throw new BadRequestException('Joignez au moins un fichier.');
  }
  if (fichiers.length > modalites.nbMaxFichiers) {
    throw new BadRequestException(
      `Trop de fichiers : cet atelier en accepte ${modalites.nbMaxFichiers} au plus par soumission.`,
    );
  }
  const acceptees = modalites.typesLivrables.map((t) => `.${t}`).join(', ');
  const tailleMax = modalites.tailleMaxMo * MO;
  return fichiers.map((f) => {
    const nom = f.nom.trim();
    if (nom.length === 0 || nom.length > BORNES_LIVRABLE.nomFichierMax) {
      throw new BadRequestException('Chaque fichier doit avoir un nom de 1 à 255 caractères.');
    }
    const extension = extensionDe(nom);
    if (
      !(EXTENSIONS_LIVRABLE as readonly string[]).includes(extension) ||
      !modalites.typesLivrables.includes(extension)
    ) {
      throw new BadRequestException(
        `Format non autorisé pour « ${nom} ». Extensions acceptées : ${acceptees}.`,
      );
    }
    if (f.taille <= 0) {
      throw new BadRequestException(`Le fichier « ${nom} » est vide.`);
    }
    if (f.taille > tailleMax) {
      throw new BadRequestException(
        `Le fichier « ${nom} » est trop volumineux : ${modalites.tailleMaxMo} Mo au plus par fichier.`,
      );
    }
    if (!signatureConforme(extension, f.entete)) {
      throw new BadRequestException(
        `Le contenu de « ${nom} » ne correspond pas à un fichier .${extension}.`,
      );
    }
    return extension as ExtensionLivrable;
  });
}

/**
 * Hash de traçabilité du livrable (preuve d'antériorité, ADR-10) : le SHA-256
 * du fichier quand il est seul ; sinon le SHA-256 de la liste TRIÉE des
 * SHA-256 des fichiers (une par ligne) — indépendant de l'ordre de dépôt.
 */
export function hashTracabilite(sha256Fichiers: readonly string[]): string {
  if (sha256Fichiers.length === 1) return sha256Fichiers[0];
  return createHash('sha256')
    .update([...sha256Fichiers].sort().join('\n'), 'utf8')
    .digest('hex');
}

/** Commentaire libre : rogné, vide -> null, ≤ 2 000 caractères (400 sinon). */
export function nettoyerCommentaire(commentaire: string | undefined | null): string | null {
  const texte = commentaire?.trim() ?? '';
  if (texte.length === 0) return null;
  if (texte.length > BORNES_LIVRABLE.commentaireMax) {
    throw new BadRequestException('Le commentaire dépasse 2 000 caractères.');
  }
  return texte;
}

/**
 * Liens externes (GitHub, Drive, déploiement…) : rognés, vides ignorés,
 * doublons retirés, 5 au plus, http(s) uniquement, ≤ 500 caractères (400).
 */
export function normaliserLiens(liens: readonly string[] | undefined): string[] {
  const uniques = [...new Set((liens ?? []).map((l) => l.trim()).filter((l) => l.length > 0))];
  if (uniques.length > BORNES_LIVRABLE.liensMax) {
    throw new BadRequestException('5 liens au plus par soumission.');
  }
  for (const lien of uniques) {
    let url: URL;
    try {
      url = new URL(lien);
    } catch {
      throw new BadRequestException(`Lien invalide : « ${lien} ».`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException(`Seuls les liens http(s) sont acceptés : « ${lien} ».`);
    }
    if (lien.length > BORNES_LIVRABLE.lienLongueurMax) {
      throw new BadRequestException('Un lien dépasse 500 caractères.');
    }
  }
  return uniques;
}

/**
 * Nom de fichier sûr pour une clé de stockage : sans accent, caractères
 * [A-Za-z0-9._-] seulement, 100 au plus. Le nom d'origine reste en base.
 */
export function nomPourStockage(nom: string): string {
  const sansAccents = nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sur = sansAccents.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '');
  return (sur.length > 0 ? sur : 'fichier').slice(-100);
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutSupport } from '../../../database/enums/statut-support.enum';

/**
 * Règles PURES des supports pédagogiques (US-IA-01) : aucune base, aucune
 * horloge, aucune entrée-sortie. Testées seules (support.regles.spec.ts).
 */

/** Formats acceptés (Backlog : PDF / PPTX / TXT ; j'ajoute MD et DOCX). */
export const EXTENSIONS_SUPPORT = ['pdf', 'txt', 'md', 'pptx', 'docx'] as const;
export type ExtensionSupport = (typeof EXTENSIONS_SUPPORT)[number];

export const BORNES_SUPPORT = {
  /** 20 Mo : un support de cours, pas une vidéo (CHECK en base identique). */
  tailleMaxOctets: 20 * 1024 * 1024,
  titreMax: 200,
  nomMax: 255,
} as const;

export const MESSAGE_FICHIER_ABSENT = 'Joignez le fichier du support dans le champ « fichier ».';
export const MESSAGE_FORMAT_SUPPORT =
  'Format non pris en charge : déposez un fichier PDF, PPTX, DOCX, TXT ou MD.';
export const MESSAGE_SUPPORT_VIDE = 'Le fichier est vide.';
export const MESSAGE_SUPPORT_TROP_GROS =
  'Le fichier dépasse 20 Mo, la taille maximale d’un support.';
export const MESSAGE_SIGNATURE_SUPPORT = 'Le contenu du fichier ne correspond pas à son extension.';
export const MESSAGE_TEXTE_BINAIRE =
  'Le fichier texte contient des données binaires : déposez un fichier texte brut.';
export const MESSAGE_SUPPORT_DOUBLON = 'Ce fichier a déjà été déposé dans ce module.';
export const MESSAGE_NON_REINDEXABLE =
  'Seul un support dont l’indexation a échoué peut être relancé.';
export const MESSAGE_SUPPORT_INTROUVABLE = 'Support introuvable.';

/** Signatures (« nombres magiques ») des formats binaires. */
const SIGNATURES: Partial<Record<ExtensionSupport, number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  pptx: [0x50, 0x4b, 0x03, 0x04], // PK.. (conteneur ZIP Office Open XML)
  docx: [0x50, 0x4b, 0x03, 0x04],
};

/** Extension en minuscules (sans le point), '' s'il n'y en a pas. */
export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point <= 0 || point === nom.length - 1 ? '' : nom.slice(point + 1).toLowerCase();
}

/** Le fichier reçu, tel que les règles le voient. */
export interface FichierRecu {
  nom: string;
  taille: number;
  /** Les premiers octets du fichier (8 Kio au plus). */
  entete: Buffer;
}

/**
 * Contrôle du fichier AVANT tout dépôt (400 sinon, rien n'est enregistré) :
 * présence, extension de la liste fermée, taille 1 octet – 20 Mo, signature
 * conforme pour les formats binaires, pas d'octet nul dans un fichier texte.
 * Le contenu réel (PDF lisible, texte exploitable) est jugé par l'indexation :
 * un échec là donne le statut ECHEC_INDEXATION (critère d'erreur du Backlog).
 */
export function verifierFichierSupport(fichier: FichierRecu | null): ExtensionSupport {
  if (!fichier) throw new BadRequestException(MESSAGE_FICHIER_ABSENT);
  const extension = extensionDe(fichier.nom);
  if (!(EXTENSIONS_SUPPORT as readonly string[]).includes(extension)) {
    throw new BadRequestException(MESSAGE_FORMAT_SUPPORT);
  }
  if (fichier.taille <= 0) throw new BadRequestException(MESSAGE_SUPPORT_VIDE);
  if (fichier.taille > BORNES_SUPPORT.tailleMaxOctets) {
    throw new BadRequestException(MESSAGE_SUPPORT_TROP_GROS);
  }
  const ext = extension as ExtensionSupport;
  const signature = SIGNATURES[ext];
  if (signature) {
    const conforme =
      fichier.entete.length >= signature.length &&
      signature.every((octet, i) => fichier.entete[i] === octet);
    if (!conforme) throw new BadRequestException(MESSAGE_SIGNATURE_SUPPORT);
  } else if (fichier.entete.includes(0)) {
    throw new BadRequestException(MESSAGE_TEXTE_BINAIRE);
  }
  return ext;
}

/**
 * Nom d'origine nettoyé : sans chemin (« C:\…\cours.pdf » -> « cours.pdf »),
 * sans caractères de contrôle, 255 caractères au plus (extension conservée).
 */
export function nomOriginal(nom: string): string {
  const base = (nom.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (base.length <= BORNES_SUPPORT.nomMax) return base || 'support';
  const extension = extensionDe(base);
  const suffixe = extension ? `.${extension}` : '';
  return base.slice(0, BORNES_SUPPORT.nomMax - suffixe.length) + suffixe;
}

/**
 * Titre du support : celui saisi (espaces réduits) ou, à défaut, le nom du
 * fichier sans son extension ; 200 caractères au plus.
 */
export function titreSupport(saisi: string | undefined | null, nom: string): string {
  const propre = (saisi ?? '').replace(/\s+/g, ' ').trim();
  const extension = extensionDe(nom);
  const base = extension ? nom.slice(0, -(extension.length + 1)) : nom;
  const titre = propre || base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Support';
  return titre.slice(0, BORNES_SUPPORT.titreMax);
}

/** Clé de l'objet sur MinIO : jamais le nom d'origine brut dans un chemin. */
export function cleStockageSupport(
  moduleId: string,
  supportId: string,
  extension: ExtensionSupport,
): string {
  return `supports/${moduleId}/${supportId}/original.${extension}`;
}

/** Relance de l'indexation : seulement après un échec (409 sinon). */
export function verifierReindexable(statut: StatutSupport): void {
  if (statut !== StatutSupport.ECHEC_INDEXATION) {
    throw new ConflictException(MESSAGE_NON_REINDEXABLE);
  }
}

/** Message d'erreur sur une ligne, 500 caractères au plus (colonne en base). */
export function resumeErreurSupport(erreur: unknown): string {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  const ligne = texte.replace(/\s+/g, ' ').trim() || 'Erreur inconnue';
  return ligne.length > 500 ? `${ligne.slice(0, 497)}...` : ligne;
}

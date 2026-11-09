import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/**
 * Règles PURES des ressources « fichier » (US-FORM-06). Aucune base, aucune
 * horloge, aucune entrée-sortie.
 *
 * Tous les types sont acceptés (décision produit du 11/10/2026) ; seuls les
 * formats SANS RISQUE sont lus dans le navigateur — et seulement si leur
 * contenu correspond à leur extension. Tout le reste est servi en
 * téléchargement (`application/octet-stream`, `attachment`) : aucun HTML,
 * SVG ou script n'est jamais interprété par le navigateur.
 */

export type ModeLecture = 'VIDEO' | 'AUDIO' | 'PDF' | 'IMAGE';

export const BORNES_FICHIER = {
  /** Plafond absolu (multer, CHECK en base, nginx = 1 Gio). */
  tailleAbsolueMaxOctets: 1024 * 1024 * 1024,
  /** Taille maximale par défaut (RESSOURCES_TAILLE_MAX_MO), vidéos comprises. */
  tailleMaxMoDefaut: 500,
  nomMax: 255,
  /** Durée de vie d'un lien de lecture (secondes). */
  lienSecondes: 600,
} as const;

export const MESSAGE_FICHIER_MANQUANT = 'Joignez le fichier dans le champ « fichier ».';
export const MESSAGE_FICHIER_VIDE = 'Le fichier est vide.';
export const MESSAGE_CONTENU_NON_CONFORME =
  'Le contenu du fichier ne correspond pas à son extension.';
export const MESSAGE_LIEN_EXPIRE =
  'Lien expiré ou invalide : rouvrez la ressource depuis la plateforme.';
export const MESSAGE_PAS_UN_FICHIER = 'Cette ressource est un lien, pas un fichier.';

type Signature = (entete: Buffer) => boolean;

/** Type lisible dans le navigateur : MIME servi, mode de lecture, signature attendue. */
interface TypeLisible {
  mime: string;
  lecture: ModeLecture;
  signature: Signature;
}

const commencePar =
  (octets: number[]): Signature =>
  (e) =>
    e.length >= octets.length && octets.every((o, i) => e[i] === o);
const ascii =
  (texte: string, decalage = 0): Signature =>
  (e) =>
    e.length >= decalage + texte.length &&
    e.toString('latin1', decalage, decalage + texte.length) === texte;
const ftyp = ascii('ftyp', 4);
const riff =
  (forme: string): Signature =>
  (e) =>
    ascii('RIFF')(e) && ascii(forme, 8)(e);
const mp3: Signature = (e) =>
  ascii('ID3')(e) || (e.length >= 2 && e[0] === 0xff && (e[1] & 0xe0) === 0xe0);

const TYPES_LISIBLES: Record<string, TypeLisible> = {
  pdf: { mime: 'application/pdf', lecture: 'PDF', signature: ascii('%PDF-') },
  png: { mime: 'image/png', lecture: 'IMAGE', signature: commencePar([0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: 'image/jpeg', lecture: 'IMAGE', signature: commencePar([0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', lecture: 'IMAGE', signature: commencePar([0xff, 0xd8, 0xff]) },
  gif: { mime: 'image/gif', lecture: 'IMAGE', signature: ascii('GIF8') },
  webp: { mime: 'image/webp', lecture: 'IMAGE', signature: riff('WEBP') },
  mp4: { mime: 'video/mp4', lecture: 'VIDEO', signature: ftyp },
  m4v: { mime: 'video/mp4', lecture: 'VIDEO', signature: ftyp },
  webm: { mime: 'video/webm', lecture: 'VIDEO', signature: commencePar([0x1a, 0x45, 0xdf, 0xa3]) },
  ogv: { mime: 'video/ogg', lecture: 'VIDEO', signature: ascii('OggS') },
  mp3: { mime: 'audio/mpeg', lecture: 'AUDIO', signature: mp3 },
  m4a: { mime: 'audio/mp4', lecture: 'AUDIO', signature: ftyp },
  ogg: { mime: 'audio/ogg', lecture: 'AUDIO', signature: ascii('OggS') },
  oga: { mime: 'audio/ogg', lecture: 'AUDIO', signature: ascii('OggS') },
  wav: { mime: 'audio/wav', lecture: 'AUDIO', signature: riff('WAVE') },
};

/** Extension en minuscules (lettres et chiffres, 16 au plus), '' sinon. */
export function extensionFichier(nom: string): string {
  const point = nom.lastIndexOf('.');
  if (point <= 0 || point === nom.length - 1) return '';
  const ext = nom.slice(point + 1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(ext) ? ext : '';
}

/** Nom d'origine sans chemin ni caractère de contrôle, 255 caractères au plus. */
export function nomFichier(nom: string): string {
  const base = (nom.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base) return 'fichier';
  if (base.length <= BORNES_FICHIER.nomMax) return base;
  const ext = extensionFichier(base);
  const suffixe = ext ? `.${ext}` : '';
  return base.slice(0, BORNES_FICHIER.nomMax - suffixe.length) + suffixe;
}

/** Ce que l'on retient d'un fichier reçu. */
export interface FichierAnalyse {
  nom: string;
  extension: string;
  typeMime: string;
  lecture: ModeLecture | null;
}

/**
 * Contrôle d'un fichier reçu : présent (400), non vide (400), sous la taille
 * maximale (413), et — pour un format lisible dans le navigateur — contenu
 * conforme à l'extension (400). Un format non lisible est accepté et sera
 * servi en téléchargement.
 */
export function analyserFichier(
  fichier: { nom: string; taille: number; entete: Buffer } | null,
  tailleMaxOctets: number,
): FichierAnalyse {
  if (!fichier) throw new BadRequestException(MESSAGE_FICHIER_MANQUANT);
  if (fichier.taille <= 0) throw new BadRequestException(MESSAGE_FICHIER_VIDE);
  if (fichier.taille > tailleMaxOctets) {
    const mo = Math.round(tailleMaxOctets / (1024 * 1024));
    throw new PayloadTooLargeException(
      `Le fichier dépasse ${mo} Mo, la taille maximale d’une ressource.`,
    );
  }
  const nom = nomFichier(fichier.nom);
  const extension = extensionFichier(nom);
  const lisible = TYPES_LISIBLES[extension];
  if (!lisible) {
    return { nom, extension, typeMime: 'application/octet-stream', lecture: null };
  }
  if (!lisible.signature(fichier.entete)) {
    throw new BadRequestException(MESSAGE_CONTENU_NON_CONFORME);
  }
  return { nom, extension, typeMime: lisible.mime, lecture: lisible.lecture };
}

/** Plage d'octets demandée (en-tête Range), bornes incluses. */
export type Plage = { debut: number; fin: number };

/**
 * En-tête Range -> plage à servir : null = tout le fichier (200) ;
 * 'INSATISFAISABLE' -> 416. Une seule plage (`bytes=a-b`, `bytes=a-`,
 * `bytes=-n`) ; plusieurs plages ou une syntaxe inconnue : tout le fichier.
 */
export function plageDemandee(
  entete: string | undefined,
  taille: number,
): Plage | null | 'INSATISFAISABLE' {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const suffixe = Number(m[2]);
    if (suffixe === 0) return 'INSATISFAISABLE';
    return { debut: Math.max(0, taille - suffixe), fin: taille - 1 };
  }
  const debut = Number(m[1]);
  const fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  if (debut >= taille || fin < debut) return 'INSATISFAISABLE';
  return { debut, fin };
}

/**
 * En-tête Content-Disposition : `inline` pour un format lisible, sinon
 * `attachment` ; nom ASCII de secours + nom UTF-8 (RFC 6266 / 5987).
 */
export function dispositionContenu(nom: string, lecture: ModeLecture | null): string {
  const secours = nom.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(nom).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${lecture ? 'inline' : 'attachment'}; filename="${secours}"; filename*=UTF-8''${utf8}`;
}

/** Clé de l'objet sur MinIO : jamais le nom d'origine. */
export function cleStockageRessource(
  moduleId: string,
  ressourceId: string,
  extension: string,
): string {
  return `ressources/${moduleId}/${ressourceId}/fichier${extension ? `.${extension}` : ''}`;
}

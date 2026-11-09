import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Règles PURES des ressources de module (US-FORM-05). Aucune base, aucune
 * horloge, aucune entrée-sortie.
 */

export const BORNES_RESSOURCE = {
  titreMax: 200,
  descriptionMax: 500,
  urlMax: 2048,
  /** Au-delà, le module devient illisible pour l'apprenant. */
  parModuleMax: 50,
} as const;

export type Plateforme = 'YOUTUBE' | 'VIMEO' | 'WEB';

export const MESSAGE_URL_INVALIDE =
  'Adresse invalide : saisissez un lien complet commençant par http:// ou https://.';
export const MESSAGE_URL_IDENTIFIANTS =
  'Adresse refusée : un lien ne doit pas contenir d’identifiant ni de mot de passe.';
export const MESSAGE_VIDEO_INTROUVABLE =
  'Lien vidéo incomplet : l’identifiant de la vidéo est introuvable dans l’adresse.';
export const MESSAGE_TROP_DE_RESSOURCES = `Un module compte ${BORNES_RESSOURCE.parModuleMax} ressources au plus.`;
export const MESSAGE_ORDRE_INVALIDE =
  'Ordre invalide : donnez chaque ressource du module exactement une fois.';
export const MESSAGE_RESSOURCE_INTROUVABLE = 'Ressource introuvable.';
export const MESSAGE_ADRESSE_FICHIER =
  'Un fichier n’a pas d’adresse : retirez-le puis déposez le nouveau fichier.';

/** Ce que l'analyse d'un lien retient (et ce que la base stocke). */
export interface LienAnalyse {
  url: string;
  plateforme: Plateforme;
  videoId: string | null;
  debutSecondes: number | null;
}

const HOTES_YOUTUBE = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const HOTES_VIMEO = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ID_VIMEO = /^[0-9]{1,12}$/;

/** « 90 », « 90s », « 1m30s », « 1h2m3s » -> secondes ; null si illisible ou nul. */
export function lireDebut(valeur: string | null): number | null {
  if (!valeur) return null;
  const nombre = /^(\d{1,6})s?$/.exec(valeur);
  if (nombre) return Number(nombre[1]) || null;
  const morceaux = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(valeur);
  if (!morceaux || valeur === '') return null;
  const total =
    Number(morceaux[1] ?? 0) * 3600 + Number(morceaux[2] ?? 0) * 60 + Number(morceaux[3] ?? 0);
  return total > 0 ? total : null;
}

/** Identifiant YouTube d'une adresse YouTube (null si absent). */
function idYoutube(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const [, prefixe, id] = url.pathname.split('/');
  return ['embed', 'shorts', 'live', 'v'].includes(prefixe) ? id || null : null;
}

/** Identifiant Vimeo (vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123). */
function idVimeo(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const numerique = [...segments].reverse().find((s) => ID_VIMEO.test(s));
  return numerique ?? null;
}

/**
 * Analyse un lien saisi par le formateur : http(s) seulement, sans
 * identifiants, 2 048 caractères au plus (400 sinon). Reconnaît les vidéos
 * YouTube (watch, youtu.be, shorts, live, embed) et Vimeo ; tout autre lien
 * est une page web. Le moment de départ d'une vidéo (`t=` / `start=`) est
 * conservé.
 */
export function analyserLien(brut: string): LienAnalyse {
  const saisie = brut.trim();
  let url: URL;
  try {
    url = new URL(saisie);
  } catch {
    throw new BadRequestException(MESSAGE_URL_INVALIDE);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw new BadRequestException(MESSAGE_URL_INVALIDE);
  }
  if (url.username || url.password) throw new BadRequestException(MESSAGE_URL_IDENTIFIANTS);
  const normalisee = url.href;
  if (normalisee.length > BORNES_RESSOURCE.urlMax) {
    throw new BadRequestException(MESSAGE_URL_INVALIDE);
  }
  const hote = url.hostname.toLowerCase();

  if (HOTES_YOUTUBE.has(hote) || hote === 'youtu.be') {
    const id = idYoutube(url);
    if (!id || !ID_YOUTUBE.test(id)) throw new BadRequestException(MESSAGE_VIDEO_INTROUVABLE);
    return {
      url: normalisee,
      plateforme: 'YOUTUBE',
      videoId: id,
      debutSecondes: lireDebut(url.searchParams.get('t') ?? url.searchParams.get('start')),
    };
  }
  if (HOTES_VIMEO.has(hote)) {
    const id = idVimeo(url);
    if (!id) throw new BadRequestException(MESSAGE_VIDEO_INTROUVABLE);
    const ancre = /^#t=(.+)$/.exec(url.hash)?.[1] ?? null;
    return { url: normalisee, plateforme: 'VIMEO', videoId: id, debutSecondes: lireDebut(ancre) };
  }
  return { url: normalisee, plateforme: 'WEB', videoId: null, debutSecondes: null };
}

/** Domaine affiché pour un lien web (« www. » retiré). */
export function domaineDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Titre / description : espaces réduites ; description vide -> null. */
export function nettoyerTexte(valeur: string | null | undefined): string | null {
  const propre = (valeur ?? '').replace(/\s+/g, ' ').trim();
  return propre || null;
}

/** 50 ressources au plus par module (409 au-delà). */
export function verifierPlace(nbActuel: number): void {
  if (nbActuel >= BORNES_RESSOURCE.parModuleMax) {
    throw new ConflictException(MESSAGE_TROP_DE_RESSOURCES);
  }
}

/** Le nouvel ordre doit citer chaque ressource du module exactement une fois. */
export function verifierNouvelOrdre(
  existants: readonly string[],
  demandes: readonly string[],
): void {
  const uniques = new Set(demandes);
  if (
    uniques.size !== demandes.length ||
    demandes.length !== existants.length ||
    existants.some((id) => !uniques.has(id))
  ) {
    throw new BadRequestException(MESSAGE_ORDRE_INVALIDE);
  }
}

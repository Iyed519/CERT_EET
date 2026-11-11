/**
 * US-QCM-12 — Règles PURES de la surveillance webcam par captures.
 */

/** Lien de lecture d'une capture : 2 minutes. */
export const LIEN_CAPTURE_SECONDES = 120;
export const PREFIXE_JETON_CAPTURE = 'capture:lien:';

export const MESSAGE_ALTERNATIVE =
  'Vous ne pouvez pas passer ce QCM en ligne sans la caméra. Demandez à votre formateur un passage surveillé en présentiel : votre refus a été enregistré.';

/** Type d'image reconnu à sa signature (jamais au nom ou au type déclaré). */
export function typeImage(contenu: Buffer): 'image/jpeg' | 'image/png' | null {
  if (contenu.length >= 3 && contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    contenu.length >= 8 &&
    contenu.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}

/**
 * Nombre maximal de captures d'une tentative : une au démarrage, puis une
 * par intervalle sur toute la durée, plus une marge pour une reprise.
 */
export function capturesMax(dureeMaxMinutes: number, intervalleSecondes: number): number {
  return Math.ceil((dureeMaxMinutes * 60) / intervalleSecondes) + 3;
}

/**
 * Écart minimal entre deux captures : la moitié de l'intervalle (le
 * navigateur peut prendre du retard, jamais de l'avance). Renvoie le nombre
 * de secondes à attendre, 0 si la capture est admise.
 */
export function attenteAvantCapture(
  derniere: Date | null,
  maintenant: Date,
  intervalleSecondes: number,
): number {
  if (!derniere) return 0;
  const ecart = (maintenant.getTime() - derniere.getTime()) / 1000;
  const minimum = intervalleSecondes / 2;
  return ecart >= minimum ? 0 : Math.ceil(minimum - ecart);
}

/** Date avant laquelle les captures sont purgées. */
export function limiteConservation(maintenant: Date, jours: number): Date {
  return new Date(maintenant.getTime() - jours * 24 * 3600 * 1000);
}

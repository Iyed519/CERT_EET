/**
 * Règles PURES de la limitation de débit de la vérification publique
 * (US-CERT-05, DS-05 étape 2) : fenêtre fixe d'une minute par adresse IP.
 */

export const FENETRE_SECONDES = 60;

export const MESSAGE_TROP_DE_REQUETES =
  'Trop de vérifications depuis votre connexion : réessayez dans une minute.';

/** Clé Redis du compteur (l'IP est normalisée : « ::ffff:1.2.3.4 » -> « 1.2.3.4 »). */
export function cleCompteur(adresseIp: string | null | undefined): string {
  const ip = (adresseIp ?? 'inconnue').replace(/^::ffff:/, '');
  return `limite:verification:${ip}`;
}

/** Au-delà de la limite -> refus. */
export function depasse(compte: number, limite: number): boolean {
  return compte > limite;
}

/** Le premier refus de la fenêtre seulement est tracé (pas de flot d'audit). */
export function premierRefus(compte: number, limite: number): boolean {
  return compte === limite + 1;
}

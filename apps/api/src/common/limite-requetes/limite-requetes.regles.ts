/**
 * Règles PURES de la limitation de débit générique (US-AUTH-06, généralisée
 * à US-AUTH-13) : fenêtre fixe par nom de limite et par adresse IP, sur le
 * modèle de la vérification publique (US-CERT-05).
 */
export interface LimiteRequetes {
  /** Nom court, partie de la clé Redis (`limite:<nom>:<ip>`). */
  nom: string;
  /** Nombre de requêtes admises dans la fenêtre. */
  limite: number;
  /** Durée de la fenêtre, en secondes. */
  fenetreSecondes: number;
}

export const MESSAGE_LIMITE_ATTEINTE =
  'Trop de tentatives depuis votre connexion : patientez avant de réessayer.';

/** Clé Redis du compteur (IP normalisée : « ::ffff:1.2.3.4 » -> « 1.2.3.4 »). */
export function cleLimite(nom: string, adresseIp: string | null | undefined): string {
  const ip = (adresseIp ?? 'inconnue').replace(/^::ffff:/, '');
  return `limite:${nom}:${ip}`;
}

/** Au-delà de la limite -> refus. */
export function limiteDepassee(compte: number, limite: number): boolean {
  return compte > limite;
}

/** Seul le premier refus de la fenêtre est tracé (pas de flot d'audit). */
export function premierRefusLimite(compte: number, limite: number): boolean {
  return compte === limite + 1;
}

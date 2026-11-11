/**
 * US-CPT-04 — Règles PURES de l'anonymisation RGPD d'un compte.
 */

/** Nom affiché à la place de l'identité d'un compte anonymisé. */
export const NOM_ANONYMISE = 'Compte anonymisé';
/** Libellé du titulaire sur la vérification publique d'un certificat. */
export const TITULAIRE_ANONYMISE = 'Titulaire anonymisé';
/** Remplace les textes libres rédigés par la personne (justifications…). */
export const TEXTE_ANONYMISE = '[anonymisé]';

/**
 * Adresse de remplacement : unique (identifiant du compte), dans le domaine
 * réservé `.invalid` (RFC 2606) — aucun email ne peut y partir.
 */
export function emailAnonyme(userId: string): string {
  return `anonyme-${userId}@anonymise.invalid`;
}

/**
 * Anti-verrouillage : retirer un administrateur ACTIF quand il n'en reste
 * qu'un est refusé (même règle qu'US-CPT-03 / US-ROL-01).
 */
export function retireDernierAdmin(
  cible: { role: string; statut: string },
  adminsActifs: number,
): boolean {
  return cible.role === 'ADMINISTRATEUR' && cible.statut === 'ACTIF' && adminsActifs <= 1;
}

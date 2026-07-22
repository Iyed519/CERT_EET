/**
 * Constructeurs des clés Redis liées aux jetons (US-AUTH-03/04/11).
 * Centralisés ici pour que le guard ET AuthService utilisent EXACTEMENT les
 * mêmes clés — aucune divergence possible.
 */
export const accessDenylistKey = (jti: string): string =>
  `denylist:access:${jti}`;
export const refreshDenylistKey = (tokenHash: string): string =>
  `denylist:refresh:${tokenHash}`;
/**
 * Marqueur "sessions valides à partir de" (timestamp Unix en secondes) : tout
 * access token de l'utilisateur émis AVANT cette date est refusé. Base de
 * l'invalidation immédiate (ex. changement de rôle, US-AUTH-11).
 */
export const sessionsValidAfterKey = (userId: string): string =>
  `sessions-valid-after:${userId}`;
/**
 * Jeton de vérification d'email (US-CPT-05) : clé -> userId, TTL 48 h. Créée à
 * l'inscription, consommée (supprimée) à la vérification. Usage unique, sans
 * table dédiée — Redis expire la clé seul si l'utilisateur ne vérifie jamais.
 */
export const verifyEmailKey = (token: string): string =>
  `verify-email:${token}`;

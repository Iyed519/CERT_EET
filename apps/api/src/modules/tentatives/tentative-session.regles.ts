import { AccessTokenPayload } from '../auth/auth.types';

/**
 * Règles PURES du verrou de session d'une tentative (US-QCM-10, DS-02
 * étape 1, UC2) : sans base ni Redis, testées seules.
 *
 * Une « session » est la famille du refresh token ouverte à la connexion
 * (claim `sid`) : stable à travers les rotations de 15 min, terminée à la
 * déconnexion ou à la révocation (D2). Un identifiant d'appareil envoyé par
 * le navigateur se falsifie ; l'adresse IP et le User-Agent ne sont pas
 * fiables.
 */

export const MESSAGE_SESSION_ACTIVE_AILLEURS = 'Vous passez déjà ce QCM sur un autre appareil.';

export const RAISON_SESSION_ACTIVE_AILLEURS = 'session_active_ailleurs';

/** Miroir Redis du verrou (DS-02, note Redis). La base décide (D3). */
export const cleSessionQcm = (apprenantId: string, qcmId: string): string =>
  `session_qcm:${apprenantId}:${qcmId}`;

/**
 * Session de la requête : le `sid` du jeton ; à défaut (jeton émis avant
 * US-QCM-10, au plus 15 min après le déploiement), son `jti`.
 */
export function sessionDe(utilisateur: Pick<AccessTokenPayload, 'sid' | 'jti'>): string {
  return utilisateur.sid ?? utilisateur.jti;
}

/**
 * Première étape, sans base :
 *   - `autorisee` : même session, ou blocage désactivé (D7) ;
 *   - `adoptee` : tentative sans session (créée avant US-QCM-10) — la
 *     session courante la prend ;
 *   - `verifier_proprietaire` : autre session, blocage actif — il faut savoir
 *     si la session détentrice est encore ouverte (D6).
 */
export type EvaluationSession = 'autorisee' | 'adoptee' | 'verifier_proprietaire';

export function evaluerSession(entree: {
  blocageActif: boolean;
  sessionTentative: string | null;
  sessionCourante: string;
}): EvaluationSession {
  if (!entree.blocageActif) return 'autorisee';
  if (entree.sessionTentative === null) return 'adoptee';
  if (entree.sessionTentative === entree.sessionCourante) return 'autorisee';
  return 'verifier_proprietaire';
}

/**
 * Seconde étape (D6) : session détentrice encore ouverte -> refus ; terminée
 * (déconnexion, famille révoquée, jeton d'avant US-QCM-10) -> la session
 * courante reprend la tentative. Aucun bouton « continuer ici » : il
 * annulerait la protection.
 */
export function trancherSession(proprietaireActive: boolean): 'refusee' | 'adoptee' {
  return proprietaireActive ? 'refusee' : 'adoptee';
}

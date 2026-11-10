import { Request } from 'express';
import { Role } from '../../database/enums/role.enum';
/** Contenu (claims) d'un access token vérifié. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  jti: string;
  // US-QCM-10 — identifiant de la session (famille du refresh token), stable
  // à travers les rotations, terminée à la déconnexion. Absent des jetons émis
  // avant US-QCM-10 : leur `jti` tient alors lieu de session.
  sid?: string;
  // US-AUTH-08 — instant d'émission en millisecondes (absent des jetons plus
  // anciens : `iat` × 1000 en tient lieu).
  tms?: number;
  iat: number;
  exp: number;
}
/** Requête Express enrichie de l'utilisateur authentifié par JwtAuthGuard. */
export type AuthenticatedRequest = Request & { user?: AccessTokenPayload };
/**
 * Profil OAuth normalisé (US-AUTH-14) : ce que la stratégie Passport extrait du
 * fournisseur (Google...) et transmet à AuthService. Indépendant du fournisseur.
 */
export interface OauthProfile {
  provider: string;
  providerId: string;
  email: string | null;
  nom: string | null;
  prenom: string | null;
}

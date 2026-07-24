import { Request } from 'express';
import { Role } from '../../database/enums/role.enum';
/** Contenu (claims) d'un access token vérifié. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  jti: string;
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

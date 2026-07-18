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

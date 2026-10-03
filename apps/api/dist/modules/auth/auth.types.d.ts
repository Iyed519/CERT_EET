import { Request } from 'express';
import { Role } from '../../database/enums/role.enum';
export interface AccessTokenPayload {
    sub: string;
    email: string;
    role: Role;
    jti: string;
    iat: number;
    exp: number;
}
export type AuthenticatedRequest = Request & {
    user?: AccessTokenPayload;
};
export interface OauthProfile {
    provider: string;
    providerId: string;
    email: string | null;
    nom: string | null;
    prenom: string | null;
}

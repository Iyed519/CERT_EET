import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { JwtConfig } from '../../../config/configuration';
import { RedisService } from '../../../redis/redis.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { accessDenylistKey, sessionsValidAfterKey } from '../auth.keys';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';

/**
 * JwtAuthGuard — authentification (US-AUTH-11).
 *
 * Vérifie l'access token de chaque requête (sauf routes @Public) :
 *   1. signature RS256 + expiration (clé PUBLIQUE) ;
 *   2. denylist Redis par jti (jeton révoqué à la déconnexion, US-AUTH-04) ;
 *   3. marqueur "sessions-valid-after" (invalidation immédiate, ex. changement
 *      de rôle) : un jeton émis avant ce marqueur est refusé.
 * En cas de succès, l'utilisateur (claims) est attaché à req.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly publicKey: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    // Clé publique lue une seule fois au démarrage (comme dans AuthService).
    const jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
    this.publicKey = fs.readFileSync(jwtConfig.publicKeyPath, 'utf8');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Route publique -> pas de vérification.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentification requise.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    // Jeton explicitement révoqué (logout).
    if (await this.redisService.exists(accessDenylistKey(payload.jti))) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    // Invalidation immédiate : jeton émis avant le marqueur de l'utilisateur.
    const validAfter = await this.redisService.get(
      sessionsValidAfterKey(payload.sub),
    );
    if (validAfter && payload.iat < Number(validAfter)) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    request.user = payload;
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { LoginDto } from './dto/login.dto';
import { JwtConfig } from '../../config/configuration';
import { RedisService } from '../../redis/redis.service';
import {
  accessDenylistKey,
  refreshDenylistKey,
  sessionsValidAfterKey,
} from './auth.keys';

const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte inactif.';
const GENERIC_REFRESH_ERROR = 'Session invalide ou expirée.';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: User['role'];
  };
}

@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
  }

  /** US-AUTH-01 — Connexion par email + mot de passe (DS-01, étapes 1-2). */
  async login(
    dto: LoginDto,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    const hashToCompare =
      user?.motDePasseHash ??
      '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';

    const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    if (user.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.signRefreshToken(user);

    const familleId = crypto.randomUUID();
    await this.persistRefreshToken(user.id, refreshToken, familleId, context);

    user.derniereConnexion = new Date();
    await this.userRepository.save(user);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /** US-AUTH-03 — Rafraîchir la session AVEC rotation (ADR-08). */
  async refresh(
    refreshToken: string,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const tokenHash = this.hashToken(refreshToken);

    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        type?: string;
      }>(refreshToken, {
        publicKey: this.getPublicKey(),
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    if (await this.redisService.exists(refreshDenylistKey(tokenHash))) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });
    if (!stored) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }
    if (!stored.active) {
      await this.revokeFamille(stored.familleId);
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }
    if (stored.dateExpiration.getTime() <= Date.now()) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user || user.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    await this.burnRefreshToken(stored);

    const accessToken = await this.signAccessToken(user);
    const newRefreshToken = await this.signRefreshToken(user);
    await this.persistRefreshToken(
      user.id,
      newRefreshToken,
      stored.familleId,
      context,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /** US-AUTH-04 — Déconnexion (DS-01, étape 5). Idempotente et tolérante. */
  async logout(
    accessToken: string | null,
    refreshToken: string | null,
    context: { adresseIp: string | null },
  ): Promise<void> {
    let userId: string | null = null;
    let revoked = false;

    if (accessToken) {
      const claims = await this.decodeAccessToken(accessToken);
      if (claims) {
        userId = claims.sub;
        const key = accessDenylistKey(claims.jti);
        const ttl = this.remainingSeconds(claims.exp);
        if (ttl > 0 && !(await this.redisService.exists(key))) {
          await this.redisService.set(key, '1', ttl);
          revoked = true;
        }
      }
    }

    if (refreshToken) {
      const stored = await this.refreshTokenRepository.findOne({
        where: { tokenHash: this.hashToken(refreshToken) },
      });
      if (stored) {
        userId = userId ?? stored.userId;
        if (stored.active) {
          await this.burnRefreshToken(stored);
          revoked = true;
        }
      }
    }

    if (revoked && userId) {
      await this.journaliserLogout(userId, context.adresseIp);
    }
  }

  /**
   * US-AUTH-11 — Invalide IMMÉDIATEMENT toutes les sessions actives d'un
   * utilisateur (ex. après un changement de rôle, US-ROL-01) :
   *   1. toutes ses sessions refresh -> active=false (plus de refresh) ;
   *   2. marqueur Redis "sessions-valid-after = maintenant" -> le JwtAuthGuard
   *      refuse tout access token émis avant cet instant.
   * TTL du marqueur = durée de vie d'un access token (au-delà ils sont expirés).
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, active: true },
      { active: false },
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.redisService.set(
      sessionsValidAfterKey(userId),
      String(nowSeconds),
      this.jwtConfig.accessTokenExpiresIn,
    );
  }

  /** Access token (15 min — ADR-08). jti unique (révocation ciblée). */
  private async signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: crypto.randomUUID(),
      },
      {
        privateKey: this.getPrivateKey(),
        algorithm: 'RS256',
        expiresIn: this.jwtConfig.accessTokenExpiresIn,
      },
    );
  }

  /** Refresh token (7 j — ADR-08). jti unique -> empreinte unique. */
  private async signRefreshToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
      {
        privateKey: this.getPrivateKey(),
        algorithm: 'RS256',
        expiresIn: this.jwtConfig.refreshTokenExpiresIn,
      },
    );
  }

  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
    familleId: string,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<void> {
    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + 7); // ADR-08 : 7 jours

    const session = this.refreshTokenRepository.create({
      userId,
      familleId,
      tokenHash: this.hashToken(refreshToken),
      adresseIp: context.adresseIp,
      userAgent: context.userAgent,
      active: true,
      dateExpiration,
    });
    await this.refreshTokenRepository.save(session);
  }

  /** Brûle un refresh token : inactif en base + denylist Redis (TTL restant). */
  private async burnRefreshToken(token: RefreshToken): Promise<void> {
    token.active = false;
    await this.refreshTokenRepository.save(token);

    const ttlSeconds = Math.max(
      1,
      Math.ceil((token.dateExpiration.getTime() - Date.now()) / 1000),
    );
    await this.redisService.set(
      refreshDenylistKey(token.tokenHash),
      '1',
      ttlSeconds,
    );
  }

  /** Détection de rejeu : révoque toute la famille (US-AUTH-03). */
  private async revokeFamille(familleId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familleId, active: true },
      { active: false },
    );
  }

  /** Écrit une entrée d'audit LOGOUT (minimal ; US-AUTH-12 formalisera). */
  private async journaliserLogout(
    userId: string,
    adresseIp: string | null,
  ): Promise<void> {
    const entry = this.auditLogRepository.create({
      userId,
      action: 'LOGOUT',
      adresseIp,
      resultat: 'Succès',
    });
    await this.auditLogRepository.save(entry);
  }

  /** Décode + vérifie un access token ; null si invalide/expiré (tolérant). */
  private async decodeAccessToken(
    token: string,
  ): Promise<{ sub: string; jti: string; exp: number } | null> {
    try {
      return await this.jwtService.verifyAsync<{
        sub: string;
        jti: string;
        exp: number;
      }>(token, {
        publicKey: this.getPublicKey(),
        algorithms: ['RS256'],
      });
    } catch {
      return null;
    }
  }

  private remainingSeconds(expSeconds: number): number {
    return Math.max(0, expSeconds - Math.floor(Date.now() / 1000));
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getPrivateKey(): string {
    return fs.readFileSync(this.jwtConfig.privateKeyPath, 'utf8');
  }

  private getPublicKey(): string {
    return fs.readFileSync(this.jwtConfig.publicKeyPath, 'utf8');
  }
}

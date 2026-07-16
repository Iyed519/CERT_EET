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
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { LoginDto } from './dto/login.dto';
import { JwtConfig } from '../../config/configuration';
import { RedisService } from '../../redis/redis.service';

const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte inactif.';

/**
 * US-AUTH-03 — Message générique pour TOUT échec de refresh (token absent,
 * invalide, expiré, révoqué, ou rejeu détecté). Même opacité qu'au login ;
 * côté frontend la réaction est identique : redirection vers /login.
 */
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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
  }

  /**
   * US-AUTH-01 — Connexion par email + mot de passe (voir DS-01, étapes 1-2).
   * Toute erreur (compte inconnu, mauvais mot de passe, compte inactif) lève
   * la MÊME exception avec le MÊME message.
   */
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

    // Nouvelle connexion = nouvelle "famille" de refresh tokens. Ce premier
    // token en est la racine ; les rotations hériteront de ce famille_id.
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

  /**
   * US-AUTH-03 — Rafraîchir la session AVEC rotation (ADR-08).
   * Vérif RS256 (clé publique) + type refresh -> denylist Redis -> session en
   * base (inconnue / rejeu -> révocation famille / expirée) -> compte ACTIF ->
   * rotation (brûle l'ancien, émet une nouvelle paire dans la même famille).
   */
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

    if (await this.redisService.exists(this.denylistKey(tokenHash))) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    // DÉTECTION DE REJEU : token existant mais déjà consommé/révoqué et
    // represente => compromission probable => on révoque toute la famille.
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

    // ROTATION : on brûle l'ancien, on émet une nouvelle paire dans la même
    // famille.
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

  /**
   * Signe l'access token (15 min — ADR-08). Porte sub + rôle. Le jti est un
   * identifiant UNIQUE du jeton (crypto.randomUUID) : il rend chaque token
   * distinct même émis la même seconde, et servira à la révocation ciblée d'un
   * access token précis (denylist Redis, US-AUTH-04).
   */
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

  /**
   * Signe le refresh token (7 j — ADR-08). Payload minimal : sub + type +
   * jti unique. Le jti garantit que chaque refresh token est unique -> son
   * empreinte SHA-256 aussi -> jamais deux lignes de même hash en base ->
   * rotation et détection de rejeu non ambiguës.
   */
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

  /**
   * Persiste une session (table refresh_tokens). On ne stocke jamais le token
   * en clair : uniquement son empreinte SHA-256. familleId regroupe les tokens
   * d'une même connexion (login = racine, rotations = même famille).
   */
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

  /**
   * Brûle un refresh token : inactif en base + inscrit sur la denylist Redis
   * avec un TTL = durée restante (au-delà il serait de toute façon expiré).
   */
  private async burnRefreshToken(token: RefreshToken): Promise<void> {
    token.active = false;
    await this.refreshTokenRepository.save(token);

    const ttlSeconds = Math.max(
      1,
      Math.ceil((token.dateExpiration.getTime() - Date.now()) / 1000),
    );
    await this.redisService.set(
      this.denylistKey(token.tokenHash),
      '1',
      ttlSeconds,
    );
  }

  /**
   * Détection de rejeu : révoque en une requête toute la famille (toutes les
   * sessions encore actives issues de la même connexion).
   */
  private async revokeFamille(familleId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familleId, active: true },
      { active: false },
    );
  }

  /** Empreinte SHA-256 : rapide, déterministe, sans limite de longueur. */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Clé Redis d'un jeton sur la denylist. */
  private denylistKey(tokenHash: string): string {
    return `denylist:refresh:${tokenHash}`;
  }

  /** Clé privée RS256 (signature). Lue depuis le secret Docker (INF07). */
  private getPrivateKey(): string {
    return fs.readFileSync(this.jwtConfig.privateKeyPath, 'utf8');
  }

  /** Clé publique RS256 (vérification du refresh token). */
  private getPublicKey(): string {
    return fs.readFileSync(this.jwtConfig.publicKeyPath, 'utf8');
  }
}
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtConfig } from '../../config/configuration';

/**
 * Réponse JSON renvoyée après login ET refresh. Volontairement SANS
 * refreshToken : celui-ci part en cookie httpOnly, jamais dans le corps JSON
 * (protection XSS, cf. DS-01).
 */
interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Contrôleur d'authentification (US-AUTH-01, US-AUTH-03).
 * Rôle mince : HTTP uniquement (validation déléguée aux DTO/pipes, métier
 * délégué à AuthService).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
  }

  /**
   * POST /auth/login (US-AUTH-01).
   * 200 (et non 201) : une connexion n'est pas une création de ressource.
   * @Res passthrough : pour poser le cookie tout en laissant Nest sérialiser.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({
    status: 200,
    description:
      'Connexion réussie. accessToken en JSON, refreshToken en cookie httpOnly.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Identifiants invalides ou compte inactif (message générique volontaire).',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.login(dto, {
      adresseIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    this.setRefreshTokenCookie(res, result.refreshToken);

    return { accessToken: result.accessToken, user: result.user };
  }

  /**
   * POST /auth/refresh (US-AUTH-03).
   *
   * Le refresh token n'est PAS dans le corps : il arrive via le cookie
   * httpOnly (envoyé automatiquement par le navigateur, scopé à /api/auth).
   * Absent => 401 direct. Sinon AuthService.refresh() fait tout le travail
   * (vérif, denylist, reuse detection, rotation) et renvoie une nouvelle paire ;
   * on repose le nouveau refresh token dans le cookie (rotation).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir la session avec rotation (US-AUTH-03)' })
  @ApiResponse({
    status: 200,
    description:
      'Nouvel access token émis ; refresh token pivoté dans le cookie httpOnly.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Refresh token absent, invalide, expiré ou révoqué → redirection /login côté frontend.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const refreshToken = req.cookies?.['refreshToken'] as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    const result = await this.authService.refresh(refreshToken, {
      adresseIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    this.setRefreshTokenCookie(res, result.refreshToken);

    return { accessToken: result.accessToken, user: result.user };
  }

  /**
   * Pose le refresh token dans un cookie httpOnly + secure + sameSite strict,
   * scopé à /api/auth (envoyé uniquement à /auth/refresh, /auth/logout — pas à
   * toute l'API). Factorisé car login ET refresh (rotation) posent ce cookie
   * de façon identique.
   */
  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // TLS terminé par Nginx (INF03) — jamais en clair.
      sameSite: 'strict', // Même origine (routage Nginx) : strict est sûr.
      path: '/api/auth', // Cookie limité aux endpoints d'authentification.
      maxAge: this.jwtConfig.refreshTokenExpiresIn * 1000, // secondes -> ms.
    });
  }
}

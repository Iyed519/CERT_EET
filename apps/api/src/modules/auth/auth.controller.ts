import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtConfig } from '../../config/configuration';

/**
 * Forme de la réponse JSON renvoyée au frontend après une connexion réussie.
 * Volontairement SANS refreshToken : celui-ci part dans un cookie httpOnly
 * (voir login() ci-dessous), pas dans le corps JSON — un script JavaScript
 * malveillant sur la page (XSS) ne doit jamais pouvoir le lire (DS-01 :
 * "access token en mémoire JavaScript, refresh token en cookie httpOnly").
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
 * Contrôleur d'authentification (US-AUTH-01).
 *
 * Rôle volontairement mince : valider la forme de la requête (délégué au
 * LoginDto + ValidationPipe global, main.ts) et transmettre à AuthService,
 * qui porte toute la logique métier. Le contrôleur ne fait AUCUNE
 * vérification de mot de passe ou de statut lui-même — Règle de séparation
 * des responsabilités (contrôleur = HTTP, service = métier).
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
   * POST /auth/login
   *
   * @HttpCode(200) explicite : NestJS renvoie 201 par défaut sur un POST,
   * mais une connexion réussie n'est pas une "création de ressource" au
   * sens REST — 200 est plus juste sémantiquement pour cette action.
   *
   * @Res({ passthrough: true }) : nécessaire pour pouvoir poser un cookie
   * (res.cookie()) TOUT EN laissant NestJS gérer normalement la réponse
   * (sérialisation JSON, status code) — sans passthrough, on devrait
   * gérer res.json() nous-mêmes et perdrait les avantages du framework.
   *
   * Le refresh token part dans un cookie httpOnly + secure + sameSite
   * strict, scopé à /api/auth (envoyé uniquement aux endpoints
   * d'authentification comme /auth/refresh et /auth/logout, pas à
   * chaque requête vers l'API) — conforme à DS-01.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({
    status: 200,
    description:
      "Connexion réussie. accessToken renvoyé en JSON, refreshToken posé en cookie httpOnly.",
  })
  @ApiResponse({
    status: 401,
    description:
      'Identifiants invalides ou compte inactif (message générique volontaire — sécurité par opacité).',
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

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: true, // TLS toujours terminé au niveau de Nginx (INF03) — jamais envoyé en clair.
      sameSite: 'strict', // Frontend et API sont sous la même origine (routage Nginx) : strict est sûr et le plus restrictif.
      path: '/api/auth', // Le cookie n'est renvoyé QUE vers /auth/refresh, /auth/logout, etc. — pas vers toute l'API.
      maxAge: this.jwtConfig.refreshTokenExpiresIn * 1000, // Node/Express attend des millisecondes, notre config est en secondes.
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
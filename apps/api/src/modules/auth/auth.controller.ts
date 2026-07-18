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

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Contrôleur d'authentification (US-AUTH-01, US-AUTH-03, US-AUTH-04).
 * HTTP uniquement : validation déléguée aux DTO/pipes, métier à AuthService.
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides ou compte inactif (message générique).' })
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

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir la session avec rotation (US-AUTH-03)' })
  @ApiResponse({ status: 200, description: 'Nouvel access token ; refresh token pivoté dans le cookie.' })
  @ApiResponse({ status: 401, description: 'Refresh absent/invalide/expiré/révoqué -> /login côté frontend.' })
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
   * POST /auth/logout (US-AUTH-04).
   *
   * L'access token vient de l'en-tête Authorization (pas de JwtAuthGuard
   * avant US-AUTH-11), le refresh token du cookie httpOnly. AuthService
   * révoque les deux (idempotent). On efface ensuite le cookie et on renvoie
   * toujours 200 — une déconnexion ne doit jamais échouer côté utilisateur.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion : révoque access + refresh (US-AUTH-04)' })
  @ApiResponse({ status: 200, description: 'Déconnexion effectuée (idempotente).' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const authHeader = req.headers.authorization;
    const accessToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : null;
    const refreshToken = (req.cookies?.['refreshToken'] as string) ?? null;

    await this.authService.logout(accessToken, refreshToken, {
      adresseIp: req.ip ?? null,
    });

    // On efface le cookie côté client (mêmes scope/attributs que la pose).
    res.clearCookie('refreshToken', { path: '/api/auth' });

    return { message: 'Déconnexion effectuée.' };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.jwtConfig.refreshTokenExpiresIn * 1000,
    });
  }
}

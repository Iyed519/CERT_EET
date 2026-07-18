import {
  Body,
  Controller,
  Get,
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
import { Public } from './decorators/public.decorator';
import { AuthenticatedRequest } from './auth.types';

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

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

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides ou compte inactif.' })
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

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir la session avec rotation (US-AUTH-03)' })
  @ApiResponse({ status: 200, description: 'Nouvel access token ; refresh token pivoté.' })
  @ApiResponse({ status: 401, description: 'Refresh absent/invalide/expiré/révoqué.' })
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

  @Public()
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

    res.clearCookie('refreshToken', { path: '/api/auth' });
    return { message: 'Déconnexion effectuée.' };
  }

  /**
   * GET /auth/me (US-AUTH-11) — route PROTÉGÉE (pas de @Public). Le
   * JwtAuthGuard global valide l'access token et attache req.user ; on renvoie
   * l'utilisateur courant. Sert aussi de route de démonstration pour tester le
   * guard d'authentification.
   */
  @Get('me')
  @ApiOperation({ summary: 'Utilisateur authentifié courant (US-AUTH-11)' })
  @ApiResponse({ status: 200, description: 'Utilisateur courant.' })
  @ApiResponse({ status: 401, description: 'Non authentifié / jeton révoqué.' })
  me(@Req() req: AuthenticatedRequest): {
    id: string;
    email: string;
    role: string;
  } {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return { id: user.sub, email: user.email, role: user.role };
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

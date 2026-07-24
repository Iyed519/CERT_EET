import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService, ProfilResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { JwtConfig, MailConfig } from '../../config/configuration';
import { Public } from './decorators/public.decorator';
import { AuthenticatedRequest, OauthProfile } from './auth.types';
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
  /**
   * US-CPT-05 — Auto-inscription publique. Route @Public (le JwtAuthGuard
   * global ne s'applique pas). Renvoie 201 SANS ouvrir de session : le compte
   * est EN_ATTENTE_ACTIVATION, l'utilisateur doit d'abord vérifier son email.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Auto-inscription publique (US-CPT-05)' })
  @ApiResponse({
    status: 201,
    description:
      'Compte créé (APPRENANT, EN_ATTENTE_ACTIVATION) ; email de vérification envoyé. Aucune session ouverte.',
  })
  @ApiResponse({ status: 409, description: 'Cet email est déjà utilisé.' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.authService.register(dto, {
      adresseIp: req.ip ?? null,
    });
    return {
      message:
        'Compte créé. Un email de vérification vous a été envoyé pour activer votre compte.',
    };
  }
  /**
   * US-CPT-05 — Vérification d'email. Route @Public : la page frontend
   * /verifier-email appelle cet endpoint avec le token du lien. Un jeton
   * valide et non expiré active le compte (statut ACTIF) ; sinon 400.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Vérifier l'email et activer le compte (US-CPT-05)" })
  @ApiResponse({ status: 200, description: 'Compte activé (statut ACTIF).' })
  @ApiResponse({ status: 400, description: 'Jeton invalide ou expiré.' })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
  ): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto.token);
    return {
      message:
        'Votre adresse email a été vérifiée. Vous pouvez maintenant vous connecter.',
    };
  }
  /**
   * US-AUTH-14 — Démarre la connexion Google. @Public + guard Passport 'google' :
   * Passport construit l'URL d'autorisation et redirige vers Google. Le corps de
   * la méthode n'est jamais exécuté (la redirection est faite par le guard).
   */
  @Public()
  @Get('oauth/google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Démarrer la connexion Google (US-AUTH-14)' })
  googleAuth(): void {
    // Redirection vers Google gérée par le guard Passport.
  }
  /**
   * US-AUTH-14 — Callback Google. Passport a validé le retour et posé le profil
   * normalisé sur req.user. On ouvre une session (cookie refresh httpOnly via
   * loginWithOauth), puis on redirige vers le frontend, qui récupérera l'access
   * token en mémoire via /auth/refresh. En cas d'échec métier -> /login.
   */
  @Public()
  @Get('oauth/google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback Google : ouvre la session (US-AUTH-14)' })
  async googleCallback(
    @Req() req: Request & { user?: OauthProfile },
    @Res() res: Response,
  ): Promise<void> {
    await this.completeOauthLogin(req, res);
  }
  /**
   * US-AUTH-14 — Démarre la connexion GitHub. Même mécanique que Google : le
   * guard Passport 'github' construit l'URL d'autorisation et redirige. Le corps
   * n'est jamais exécuté.
   */
  @Public()
  @Get('oauth/github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Démarrer la connexion GitHub (US-AUTH-14)' })
  githubAuth(): void {
    // Redirection vers GitHub gérée par le guard Passport.
  }
  /**
   * US-AUTH-14 — Callback GitHub. Passport a posé le profil normalisé sur
   * req.user ; on ouvre la session exactement comme pour Google (find-link-or-
   * create + cookie refresh httpOnly), puis on redirige vers le frontend.
   */
  @Public()
  @Get('oauth/github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Callback GitHub : ouvre la session (US-AUTH-14)' })
  async githubCallback(
    @Req() req: Request & { user?: OauthProfile },
    @Res() res: Response,
  ): Promise<void> {
    await this.completeOauthLogin(req, res);
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
  @ApiOperation({ summary: 'Utilisateur authentifié courant (US-AUTH-11/15)' })
  @ApiResponse({
    status: 200,
    description: 'Profil courant (incl. profil_complet).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié / jeton révoqué.' })
  async me(@Req() req: AuthenticatedRequest): Promise<ProfilResult> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    // US-AUTH-15 : on charge le profil complet (dont profil_complet) depuis la
    // base, pas seulement les claims du JWT — le frontend décide d'afficher la
    // carte de complétion à partir de profil_complet.
    return this.authService.getMe(user.sub);
  }
  /**
   * US-AUTH-15 — Compléter le profil apprenant (route PROTÉGÉE). Appelée par la
   * carte bloquante à la première connexion. Renvoie le profil mis à jour.
   */
  @Patch('profile')
  @ApiOperation({ summary: 'Compléter le profil apprenant (US-AUTH-15)' })
  @ApiResponse({ status: 200, description: 'Profil complété.' })
  @ApiResponse({ status: 400, description: 'Données invalides (âge, domaine…).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProfilResult> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.authService.completeProfile(user.sub, dto, {
      adresseIp: req.ip ?? null,
    });
  }
  /**
   * US-AUTH-14 — Logique commune aux callbacks OAuth (Google, GitHub). Passport
   * a déjà validé l'identité et posé le profil normalisé sur req.user. On ouvre
   * une session (cookie refresh httpOnly via loginWithOauth) puis on redirige
   * vers le frontend, qui récupérera l'access token via /auth/refresh. En cas
   * d'échec (pas de profil, compte inactif, email absent…) -> /login?erreur=oauth.
   */
  private async completeOauthLogin(
    req: Request & { user?: OauthProfile },
    res: Response,
  ): Promise<void> {
    const { appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const oauth = req.user;
    if (!oauth) {
      res.redirect(`${appBaseUrl}/login?erreur=oauth`);
      return;
    }
    try {
      const result = await this.authService.loginWithOauth(oauth, {
        adresseIp: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
      this.setRefreshTokenCookie(res, result.refreshToken);
      res.redirect(`${appBaseUrl}/oauth/callback`);
    } catch {
      res.redirect(`${appBaseUrl}/login?erreur=oauth`);
    }
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

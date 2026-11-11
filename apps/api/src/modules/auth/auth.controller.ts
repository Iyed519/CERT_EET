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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService, MfaSetupResult, ProfilResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { ChangerMotDePasseDto } from './dto/changer-mot-de-passe.dto';
import {
  DemanderReinitialisationDto,
  ReinitialiserMotDePasseDto,
} from './dto/mot-de-passe-oublie.dto';
import {
  MESSAGE_DEMANDE_REINITIALISATION,
  MotDePasseOublieService,
} from './mot-de-passe-oublie.service';
import { LimiteRequetesGuard } from '../../common/limite-requetes/limite-requetes.guard';
import { AppliquerLimite } from '../../common/limite-requetes/limite-requetes.decorator';
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
    private readonly motDePasseOublie: MotDePasseOublieService,
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
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'inscription', limite: 30, fenetreSecondes: 15 * 60 })
  @ApiResponse({ status: 429, description: 'Trop de requêtes depuis cette adresse IP (US-AUTH-13).' })
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
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'verification-email', limite: 30, fenetreSecondes: 15 * 60 })
  @ApiResponse({ status: 429, description: 'Trop de requêtes depuis cette adresse IP (US-AUTH-13).' })
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
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'connexion', limite: 30, fenetreSecondes: 60 })
  @ApiResponse({ status: 429, description: 'Trop de requêtes depuis cette adresse IP (US-AUTH-13).' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides ou compte inactif.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody | { mfaRequired: true; mfaToken: string }> {
    const result = await this.authService.login(dto, {
      adresseIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    // US-AUTH-02 : MFA active -> aucun jeton, on renvoie le défi (mfaToken).
    if ('mfaRequired' in result) {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }
    this.setRefreshTokenCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  /**
   * US-AUTH-02 — Seconde étape : vérifie le code TOTP + le mfaToken temporaire
   * et, si OK, ouvre la session (accessToken en JSON, refresh en cookie
   * httpOnly), comme /auth/login classique. @Public : aucun jeton d'accès n'est
   * encore émis à ce stade.
   */
  @Public()
  @Post('mfa/verify')
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'mfa', limite: 30, fenetreSecondes: 60 })
  @ApiResponse({ status: 429, description: 'Trop de requêtes depuis cette adresse IP (US-AUTH-13).' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code MFA et ouvrir la session (US-AUTH-02)' })
  @ApiResponse({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' })
  @ApiResponse({ status: 401, description: 'Jeton MFA invalide/expiré ou code invalide.' })
  async mfaVerify(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.mfaVerify(dto.mfaToken, dto.code, {
      adresseIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setRefreshTokenCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Public()
  @Post('refresh')
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'rafraichissement', limite: 120, fenetreSecondes: 60 })
  @ApiResponse({ status: 429, description: 'Trop de requêtes depuis cette adresse IP (US-AUTH-13).' })
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
  @ApiBearerAuth('access-token')
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
  @ApiBearerAuth('access-token')
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
   * US-AUTH-09 — Demarre l'enrolement MFA (route PROTEGEE). Renvoie l'URI
   * otpauth + un QR (data URL) a scanner dans l'app d'authentification. Le
   * secret reste "en attente" tant que /auth/mfa/enable n'a pas confirme un code.
   */
  @ApiBearerAuth('access-token')
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Demarrer l'enrolement MFA (US-AUTH-09)" })
  @ApiResponse({ status: 200, description: 'otpauthUrl + qrDataUrl (secret en attente).' })
  @ApiResponse({ status: 401, description: 'Non authentifie.' })
  @ApiResponse({ status: 409, description: 'MFA deja activee.' })
  async mfaSetup(@Req() req: AuthenticatedRequest): Promise<MfaSetupResult> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    return this.authService.mfaSetup(user.sub);
  }

  /**
   * US-AUTH-09 — Confirme l'activation MFA (route PROTEGEE) : un code TOTP valide
   * contre le secret en attente active la MFA (mfa_active=true) et persiste le
   * secret. 400 si le code est invalide ou l'activation expiree.
   */
  @ApiBearerAuth('access-token')
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirmer l'activation MFA (US-AUTH-09)" })
  @ApiResponse({ status: 200, description: 'MFA activee.' })
  @ApiResponse({ status: 400, description: 'Code invalide ou activation expiree.' })
  @ApiResponse({ status: 401, description: 'Non authentifie.' })
  @ApiResponse({ status: 409, description: 'MFA deja activee.' })
  async mfaEnable(
    @Body() dto: MfaCodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    await this.authService.mfaEnable(user.sub, dto.code, {
      adresseIp: req.ip ?? null,
    });
    return { message: 'Double authentification activee.' };
  }

  /**
   * US-AUTH-09 — Desactive la MFA (route PROTEGEE). Exige un code TOTP valide.
   * Efface le secret et repasse mfa_active a false.
   */
  @ApiBearerAuth('access-token')
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactiver la MFA (US-AUTH-09)' })
  @ApiResponse({ status: 200, description: 'MFA desactivee.' })
  @ApiResponse({ status: 400, description: 'MFA non activee ou code invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifie.' })
  async mfaDisable(
    @Body() dto: MfaCodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    await this.authService.mfaDisable(user.sub, dto.code, {
      adresseIp: req.ip ?? null,
    });
    return { message: 'Double authentification desactivee.' };
  }

  /**
   * US-AUTH-08 — Changer son mot de passe (route PROTÉGÉE). Exige le mot de
   * passe actuel ; en cas de succès, TOUTES les sessions de l'utilisateur sont
   * révoquées (celle-ci comprise) et le cookie refresh est effacé : le
   * frontend renvoie vers la connexion.
   */
  @ApiBearerAuth('access-token')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer son mot de passe (US-AUTH-08)' })
  @ApiResponse({ status: 200, description: 'Mot de passe changé ; toutes les sessions sont déconnectées.' })
  @ApiResponse({ status: 400, description: 'Nouveau mot de passe non conforme ou identique.' })
  @ApiResponse({ status: 401, description: 'Mot de passe actuel incorrect, ou non authentifié.' })
  @ApiResponse({ status: 409, description: 'Compte sans mot de passe local (connexion sociale).' })
  async changerMotDePasse(
    @Body() dto: ChangerMotDePasseDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string; sessionsRevoquees: number }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    const { sessionsRevoquees } = await this.authService.changerMotDePasse(user, dto, {
      adresseIp: req.ip ?? null,
    });
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return {
      message:
        'Mot de passe modifié. Toutes vos sessions ont été déconnectées : reconnectez-vous avec votre nouveau mot de passe.',
      sessionsRevoquees,
    };
  }

  /**
   * US-AUTH-06 — Mot de passe oublié : demande d'un lien. Route @Public,
   * limitée par IP (5 demandes / 15 min, puis 429). Réponse TOUJOURS
   * identique, que l'adresse corresponde ou non à un compte actif.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'mdp-oublie', limite: 5, fenetreSecondes: 15 * 60 })
  @ApiOperation({ summary: 'Demander un lien de réinitialisation (US-AUTH-06)' })
  @ApiResponse({ status: 200, description: 'Réponse neutre, identique dans tous les cas.' })
  @ApiResponse({ status: 400, description: 'Adresse email mal formée.' })
  @ApiResponse({ status: 429, description: 'Trop de demandes depuis cette adresse IP.' })
  async demanderReinitialisation(
    @Body() dto: DemanderReinitialisationDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.motDePasseOublie.demander(dto.email, { adresseIp: req.ip ?? null });
    return { message: MESSAGE_DEMANDE_REINITIALISATION };
  }

  /**
   * US-AUTH-06 — Réinitialisation avec le jeton du lien (usage unique,
   * 30 min). Toutes les sessions du compte sont ensuite révoquées. Limitée
   * par IP (10 essais / 15 min).
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'mdp-reinitialisation', limite: 10, fenetreSecondes: 15 * 60 })
  @ApiOperation({ summary: 'Réinitialiser le mot de passe avec le lien reçu (US-AUTH-06)' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé ; toutes les sessions sont fermées.' })
  @ApiResponse({ status: 400, description: 'Lien invalide, expiré ou déjà utilisé ; mot de passe non conforme.' })
  @ApiResponse({ status: 429, description: 'Trop d’essais depuis cette adresse IP.' })
  async reinitialiserMotDePasse(
    @Body() dto: ReinitialiserMotDePasseDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.motDePasseOublie.reinitialiser(dto.token, dto.nouveauMotDePasse, {
      adresseIp: req.ip ?? null,
    });
    return {
      message:
        'Votre mot de passe a été réinitialisé. Toutes vos sessions ont été fermées : connectez-vous avec le nouveau mot de passe.',
    };
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

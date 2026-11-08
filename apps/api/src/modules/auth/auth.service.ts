import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CompteOauth } from '../../database/entities/compte-oauth.entity';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { Role } from '../../database/enums/role.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { NiveauEtudes } from '../../database/enums/niveau-etudes.enum';
import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import { Etablissement } from '../../database/entities/etablissement.entity';
import { OauthProfile } from './auth.types';
import { JwtConfig } from '../../config/configuration';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import {
  accessDenylistKey,
  mfaSessionKey,
  mfaSetupKey,
  refreshDenylistKey,
  sessionsValidAfterKey,
  verifyEmailKey,
} from './auth.keys';
const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte inactif.';
const GENERIC_REFRESH_ERROR = 'Session invalide ou expirée.';
const GENERIC_OAUTH_ERROR = 'Connexion sociale impossible.';
// US-AUTH-02 : message générique (opacité) pour tout échec de la vérif MFA.
const GENERIC_MFA_ERROR = 'Code de vérification invalide ou expiré.';
// ADR-11 : le jeton de vérification d'email est valable 48 h.
const VERIFY_EMAIL_TTL_SECONDS = 48 * 3600;
// US-AUTH-09 : emetteur affiche dans l'app d'authentification (Google Auth...).
const MFA_ISSUER = 'Cert_EET';
// US-AUTH-09 : TTL du secret en attente d'enrolement (scan + saisie du code).
const MFA_SETUP_TTL_SECONDS = 10 * 60;
// US-AUTH-02 : durée de vie du défi MFA à la connexion (5 min).
const MFA_SESSION_TTL_SECONDS = 5 * 60;
/** Donnees d'enrolement MFA renvoyees par /auth/mfa/setup (US-AUTH-09). */
export interface MfaSetupResult {
  otpauthUrl: string;
  qrDataUrl: string;
}
/** Defi MFA renvoye par /auth/login quand la MFA est active (US-AUTH-02). */
export interface MfaChallengeResult {
  mfaRequired: true;
  mfaToken: string;
}
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: User['role'];
  };
}
/** Vue profil renvoyée par getMe / completeProfile (US-AUTH-15). */
export interface ProfilResult {
  id: string;
  email: string;
  role: User['role'];
  profilComplet: boolean;
  mfaActive: boolean;
  dateNaissance: string | null;
  age: number | null;
  niveauEtudes: NiveauEtudes | null;
  domaineEtudesId: string | null;
  etablissementId: string | null;
  etablissementAutre: string | null;
}
@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfig;
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(CompteOauth)
    private readonly compteOauthRepository: Repository<CompteOauth>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    // US-AUTH-12 : writer d'audit UNIQUE (AuditModule @Global). Remplace
    // l'ancienne injection directe du repository AuditLog.
    private readonly auditService: AuditService,
  ) {
    this.jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
    // ADR-08 : tolerance d'un pas TOTP (+/-30 s) pour absorber la derive
    // d'horloge entre le serveur et l'app d'authentification.
    authenticator.options = { window: 1 };
  }
  /**
   * US-CPT-05 — Auto-inscription publique (ADR-11).
   *
   * Crée un compte APPRENANT en attente de vérification d'email :
   *   1. unicité de l'email (sinon 409, aucune création) ;
   *   2. hachage bcrypt (cost 12 — ADR-08) du mot de passe ;
   *   3. rôle FORCÉ à APPRENANT (jamais lu depuis la requête -> anti-élévation)
   *      et statut EN_ATTENTE_ACTIVATION (le login n'accepte que ACTIF, donc le
   *      compte ne peut pas se connecter tant que l'email n'est pas vérifié) ;
   *   4. jeton de vérification (UUID) stocké dans Redis (TTL 48 h) + email ;
   *   5. journalisation COMPTE_CREE ;
   *   6. AUCUNE session ouverte : on ne connecte pas l'utilisateur (201, sans jeton).
   */
  async register(dto: RegisterDto, context: { adresseIp: string | null }): Promise<void> {
    const emailExistant = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (emailExistant) {
      // 409 explicite : UX d'inscription standard. Compromis d'énumération
      // d'emails assumé et documenté (ADR-11).
      throw new ConflictException('Cet email est déjà utilisé.');
    }
    const motDePasseHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      email: dto.email,
      nom: dto.nom,
      prenom: dto.prenom,
      motDePasseHash,
      role: Role.APPRENANT,
      statut: StatutCompte.EN_ATTENTE_ACTIVATION,
    });
    const saved = await this.userRepository.save(user);
    // Jeton à usage unique en Redis : clé -> userId, expiration auto à 48 h.
    const token = crypto.randomUUID();
    await this.redisService.set(verifyEmailKey(token), saved.id, VERIFY_EMAIL_TTL_SECONDS);
    // Envoi bloquant (await) : si l'email ne part pas, on veut le savoir tout
    // de suite (fail-fast honnête). Le renvoi d'email est une story ultérieure.
    await this.mailService.sendVerificationEmail(saved.email, token);
    // Audit COMPTE_CREE (via le writer unique — US-AUTH-12).
    await this.auditService.record({
      action: 'COMPTE_CREE',
      acteur: saved.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
  }
  /**
   * US-CPT-05 — Vérification de l'adresse email (activation du compte).
   *
   * Consomme le jeton de vérification (usage unique) déposé en Redis à
   * l'inscription : s'il existe encore (non expiré, non consommé), on passe le
   * compte en ACTIF et on supprime la clé. Sinon on refuse. Idempotence
   * naturelle : un 2e clic ne trouve plus la clé -> refus explicite.
   */
  async verifyEmail(token: string): Promise<void> {
    const key = verifyEmailKey(token);
    const userId = await this.redisService.get(key);
    if (!userId) {
      // Jeton absent = invalide, expiré (TTL 48 h écoulé) ou déjà consommé.
      throw new BadRequestException('Lien de vérification invalide ou expiré.');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      // Cas limite : compte supprimé entre-temps. On nettoie la clé et on refuse.
      await this.redisService.del(key);
      throw new BadRequestException('Lien de vérification invalide ou expiré.');
    }
    user.statut = StatutCompte.ACTIF;
    await this.userRepository.save(user);
    // Consommation du jeton : usage unique (supprimé après succès).
    await this.redisService.del(key);
    // Audit léger de l'activation (via le writer unique — US-AUTH-12).
    await this.auditService.record({
      action: 'EMAIL_VERIFIE',
      acteur: user.id,
      resultat: 'Succès',
    });
  }
  /** US-AUTH-01 — Connexion par email + mot de passe (DS-01, étapes 1-2). */
  async login(
    dto: LoginDto,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult | MfaChallengeResult> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    const hashToCompare =
      user?.motDePasseHash ?? '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';
    const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    if (user.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    // US-AUTH-02 (DS-01 étape 3) : si la MFA est active, on N'ÉMET PAS les
    // jetons. On ouvre une session MFA temporaire (Redis, 5 min) et on renvoie
    // un défi ; les jetons ne seront émis qu'après /auth/mfa/verify.
    if (user.mfaActive) {
      const mfaToken = crypto.randomUUID();
      await this.redisService.set(mfaSessionKey(mfaToken), user.id, MFA_SESSION_TTL_SECONDS);
      return { mfaRequired: true, mfaToken };
    }
    return this.issueSession(user, context, 'LOGIN');
  }

  /**
   * US-AUTH-02 — Seconde étape de connexion : vérifie le code TOTP contre la
   * session MFA temporaire. Usage UNIQUE : la session est supprimée AVANT
   * l'émission des jetons (anti-rejeu). 401 générique si le jeton MFA est
   * inconnu/expiré, le compte inéligible ou le code invalide.
   */
  async mfaVerify(
    mfaToken: string,
    code: string,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const userId = await this.redisService.get(mfaSessionKey(mfaToken));
    if (!userId) {
      throw new UnauthorizedException(GENERIC_MFA_ERROR);
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.statut !== StatutCompte.ACTIF || !user.mfaActive || !user.mfaSecret) {
      throw new UnauthorizedException(GENERIC_MFA_ERROR);
    }
    if (!this.verifierTotp(code, user.mfaSecret)) {
      throw new UnauthorizedException(GENERIC_MFA_ERROR);
    }
    // Usage unique : suppression de la session MFA AVANT d'émettre.
    await this.redisService.del(mfaSessionKey(mfaToken));
    return this.issueSession(user, context, 'LOGIN');
  }

  /**
   * Émet la paire de jetons + crée la session refresh + met à jour
   * derniereConnexion + journalise. Chemin PARTAGÉ entre login (sans MFA) et
   * mfaVerify (après MFA) — une seule source d'émission, pas de double-audit.
   */
  private async issueSession(
    user: User,
    context: { adresseIp: string | null; userAgent: string | null },
    auditAction: string,
  ): Promise<LoginResult> {
    // La famille du refresh token EST la session (US-QCM-10, D2) : son
    // identifiant part aussi dans l'access token (claim `sid`).
    const familleId = crypto.randomUUID();
    const accessToken = await this.signAccessToken(user, familleId);
    const refreshToken = await this.signRefreshToken(user);
    await this.persistRefreshToken(user.id, refreshToken, familleId, context);
    user.derniereConnexion = new Date();
    await this.userRepository.save(user);
    await this.auditService.record({
      action: auditAction,
      acteur: user.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
  /**
   * US-AUTH-14 — Connexion / inscription via un fournisseur OAuth (Google...).
   *
   * Stratégie « find-link-or-create » :
   *   1. identité déjà liée (provider + providerId) -> on récupère le compte ;
   *   2. sinon, un compte avec le même email existe -> on LIE l'identité à ce
   *      compte (ADR-11 : liaison si l'email existe) ;
   *   3. sinon, on CRÉE un compte APPRENANT (rôle forcé) directement ACTIF — le
   *      fournisseur a déjà vérifié l'email, aucune vérification à refaire.
   * Le fournisseur ayant vérifié l'email, un compte trouvé encore
   * EN_ATTENTE_ACTIVATION est promu ACTIF ; un compte DESACTIVE/ANONYMISE est
   * refusé. Ensuite : émission de session JWT identique au login classique.
   */
  async loginWithOauth(
    oauth: OauthProfile,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const lien = await this.compteOauthRepository.findOne({
      where: { provider: oauth.provider, providerId: oauth.providerId },
    });
    let user: User | null = null;
    if (lien) {
      user = await this.userRepository.findOne({ where: { id: lien.userId } });
    } else {
      // Google fournit l'email avec le scope 'email' ; garde de sécurité sinon.
      if (!oauth.email) {
        throw new UnauthorizedException(GENERIC_OAUTH_ERROR);
      }
      // Liaison par email si un compte existe déjà (ADR-11).
      user = await this.userRepository.findOne({
        where: { email: oauth.email },
      });
      if (!user) {
        // Création d'un compte APPRENANT ACTIF (email vérifié par le fournisseur).
        user = this.userRepository.create({
          email: oauth.email,
          nom: oauth.nom,
          prenom: oauth.prenom,
          motDePasseHash: null,
          role: Role.APPRENANT,
          statut: StatutCompte.ACTIF,
        });
        user = await this.userRepository.save(user);
        await this.auditService.record({
          action: 'COMPTE_CREE',
          acteur: user.id,
          adresseIp: context.adresseIp,
          resultat: 'Succès',
        });
      }
      // Enregistrement du lien identité externe -> compte.
      const nouveauLien = this.compteOauthRepository.create({
        userId: user.id,
        provider: oauth.provider,
        providerId: oauth.providerId,
        email: oauth.email,
      });
      await this.compteOauthRepository.save(nouveauLien);
    }
    if (!user) {
      throw new UnauthorizedException(GENERIC_OAUTH_ERROR);
    }
    // Email vérifié par le fournisseur -> un compte en attente devient ACTIF.
    if (user.statut === StatutCompte.EN_ATTENTE_ACTIVATION) {
      user.statut = StatutCompte.ACTIF;
    }
    if (user.statut !== StatutCompte.ACTIF) {
      // DESACTIVE ou ANONYMISE : connexion refusée.
      throw new UnauthorizedException(GENERIC_OAUTH_ERROR);
    }
    // La famille du refresh token EST la session (US-QCM-10, D2) : son
    // identifiant part aussi dans l'access token (claim `sid`).
    const familleId = crypto.randomUUID();
    const accessToken = await this.signAccessToken(user, familleId);
    const refreshToken = await this.signRefreshToken(user);
    await this.persistRefreshToken(user.id, refreshToken, familleId, context);
    user.derniereConnexion = new Date();
    await this.userRepository.save(user);
    await this.auditService.record({
      action: 'CONNEXION_OAUTH',
      acteur: user.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
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
    // Même session après rotation : le `sid` reste celui de la famille.
    // Le nouveau jeton est enregistré AVANT de brûler l'ancien : la famille
    // n'a jamais zéro jeton actif, sinon une session vivante paraîtrait
    // terminée un instant (verrou de session QCM, US-QCM-10, D6).
    const accessToken = await this.signAccessToken(user, stored.familleId);
    const newRefreshToken = await this.signRefreshToken(user);
    await this.persistRefreshToken(user.id, newRefreshToken, stored.familleId, context);
    await this.burnRefreshToken(stored);
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
    await this.refreshTokenRepository.update({ userId, active: true }, { active: false });
    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.redisService.set(
      sessionsValidAfterKey(userId),
      String(nowSeconds),
      this.jwtConfig.accessTokenExpiresIn,
    );
  }
  /**
   * US-AUTH-15 — Profil courant (incl. profil_complet). Alimente /auth/me : le
   * frontend affiche la carte de complétion tant que profil_complet est faux.
   */
  async getMe(userId: string): Promise<ProfilResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.mapProfil(user);
  }
  /**
   * US-AUTH-15 — Complète le profil apprenant (première connexion).
   *
   *   - âge >= 13 (dérivé de date_naissance, jamais stocké) ;
   *   - si en études : domaine requis (FK vérifiée) + établissement (FK, ou
   *     texte libre `etablissementAutre`, ou aucun) ;
   *   - si plus en études : domaine/établissement remis à null ;
   *   - profil_complet passe à true ; audit PROFIL_COMPLETE.
   *
   * Les repos référentiels sont interrogés via userRepository.manager pour ne
   * PAS alourdir le constructeur d'AuthService (et ne pas casser son spec DI).
   */
  async completeProfile(
    userId: string,
    dto: CompleteProfileDto,
    context: { adresseIp: string | null },
  ): Promise<ProfilResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    if (this.calculerAge(dto.dateNaissance) < 13) {
      throw new BadRequestException("L'âge minimum requis est de 13 ans.");
    }
    if (dto.enEtudes) {
      if (!dto.domaineEtudesId) {
        throw new BadRequestException("Le domaine d'études est requis.");
      }
      const domaine = await this.userRepository.manager.findOne(DomaineEtudes, {
        where: { id: dto.domaineEtudesId },
      });
      if (!domaine) {
        throw new BadRequestException("Domaine d'études inconnu.");
      }
      user.domaineEtudesId = dto.domaineEtudesId;
      if (dto.etablissementId) {
        const etab = await this.userRepository.manager.findOne(Etablissement, {
          where: { id: dto.etablissementId },
        });
        if (!etab) {
          throw new BadRequestException('Établissement inconnu.');
        }
        user.etablissementId = dto.etablissementId;
        user.etablissementAutre = null;
      } else if (dto.etablissementAutre) {
        user.etablissementId = null;
        user.etablissementAutre = dto.etablissementAutre;
      } else {
        user.etablissementId = null;
        user.etablissementAutre = null;
      }
    } else {
      // Plus en études : aucun domaine ni établissement.
      user.domaineEtudesId = null;
      user.etablissementId = null;
      user.etablissementAutre = null;
    }
    user.dateNaissance = dto.dateNaissance;
    user.niveauEtudes = dto.niveauEtudes;
    user.profilComplet = true;
    await this.userRepository.save(user);
    await this.auditService.record({
      action: 'PROFIL_COMPLETE',
      acteur: user.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
    return this.mapProfil(user);
  }
  /**
   * US-AUTH-09 — Demarre l'enrolement MFA (self-service, utilisateur connecte).
   *
   * Genere un secret TOTP EN ATTENTE (Redis, TTL court — jamais ecrit en base a
   * ce stade) et renvoie l'URI otpauth + un QR (data URL) a scanner. Le secret
   * n'est confirme et persiste qu'a l'appel de mfaEnable avec un code valide.
   * 409 si la MFA est deja active (rien a re-enroler).
   */
  async mfaSetup(userId: string): Promise<MfaSetupResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    if (user.mfaActive) {
      throw new ConflictException('La double authentification est deja activee.');
    }
    const secret = authenticator.generateSecret();
    await this.redisService.set(mfaSetupKey(userId), secret, MFA_SETUP_TTL_SECONDS);
    const otpauthUrl = authenticator.keyuri(user.email, MFA_ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl };
  }

  /**
   * US-AUTH-09 — Confirme l'activation MFA : verifie le code TOTP contre le
   * secret EN ATTENTE (Redis). En cas de succes, persiste le secret en base,
   * passe mfa_active a true, consomme la cle Redis et journalise MFA_ACTIVEE.
   * 400 si aucune activation en cours (expiree/inexistante) ou code invalide.
   */
  async mfaEnable(
    userId: string,
    code: string,
    context: { adresseIp: string | null },
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    if (user.mfaActive) {
      throw new ConflictException('La double authentification est deja activee.');
    }
    const secret = await this.redisService.get(mfaSetupKey(userId));
    if (!secret) {
      throw new BadRequestException(
        "Aucune activation en cours ou delai depasse. Relancez l'activation.",
      );
    }
    if (!this.verifierTotp(code, secret)) {
      throw new BadRequestException('Code invalide.');
    }
    user.mfaSecret = secret;
    user.mfaActive = true;
    await this.userRepository.save(user);
    await this.redisService.del(mfaSetupKey(userId));
    await this.auditService.record({
      action: 'MFA_ACTIVEE',
      acteur: user.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
  }

  /**
   * US-AUTH-09 — Desactive la MFA. Exige un code TOTP valide (anti-abus : une
   * session volee ne peut pas retirer la protection sans l'app d'authentification).
   * Efface le secret + mfa_active=false et journalise MFA_DESACTIVEE. 400 si la
   * MFA n'est pas active ou si le code est invalide.
   */
  async mfaDisable(
    userId: string,
    code: string,
    context: { adresseIp: string | null },
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Non authentifie.');
    }
    if (!user.mfaActive || !user.mfaSecret) {
      throw new BadRequestException("La double authentification n'est pas activee.");
    }
    if (!this.verifierTotp(code, user.mfaSecret)) {
      throw new BadRequestException('Code invalide.');
    }
    user.mfaActive = false;
    user.mfaSecret = null;
    await this.userRepository.save(user);
    await this.auditService.record({
      action: 'MFA_DESACTIVEE',
      acteur: user.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
  }

  /**
   * Verifie un code TOTP contre un secret base32 (tolerance +/-1 pas, reglee
   * dans le constructeur). Centralise ici : enable, disable et verify l'utilisent.
   */
  private verifierTotp(code: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch {
      // otplib peut lever si le secret est malforme : on traite comme invalide.
      return false;
    }
  }

  /** Projette un User vers la vue profil (âge dérivé, jamais stocké). */
  private mapProfil(user: User): ProfilResult {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      profilComplet: user.profilComplet,
      mfaActive: user.mfaActive,
      dateNaissance: user.dateNaissance,
      age: user.dateNaissance ? this.calculerAge(user.dateNaissance) : null,
      niveauEtudes: user.niveauEtudes,
      domaineEtudesId: user.domaineEtudesId,
      etablissementId: user.etablissementId,
      etablissementAutre: user.etablissementAutre,
    };
  }
  /** Âge en années à partir d'une date ISO (AAAA-MM-JJ). */
  private calculerAge(dateNaissance: string): number {
    const naissance = new Date(dateNaissance);
    const maintenant = new Date();
    let age = maintenant.getFullYear() - naissance.getFullYear();
    const mois = maintenant.getMonth() - naissance.getMonth();
    if (mois < 0 || (mois === 0 && maintenant.getDate() < naissance.getDate())) {
      age -= 1;
    }
    return age;
  }
  /**
   * Access token (15 min — ADR-08). jti unique (révocation ciblée) ; `sid` =
   * famille du refresh token, stable pendant toute la session (US-QCM-10).
   */
  private async signAccessToken(user: User, familleId: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: crypto.randomUUID(),
        sid: familleId,
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
    const ttlSeconds = Math.max(1, Math.ceil((token.dateExpiration.getTime() - Date.now()) / 1000));
    await this.redisService.set(refreshDenylistKey(token.tokenHash), '1', ttlSeconds);
  }
  /** Détection de rejeu : révoque toute la famille (US-AUTH-03). */
  private async revokeFamille(familleId: string): Promise<void> {
    await this.refreshTokenRepository.update({ familleId, active: true }, { active: false });
  }
  /** Écrit une entrée d'audit LOGOUT via le writer unique (US-AUTH-12). */
  private async journaliserLogout(userId: string, adresseIp: string | null): Promise<void> {
    await this.auditService.record({
      action: 'LOGOUT',
      acteur: userId,
      adresseIp,
      resultat: 'Succès',
    });
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

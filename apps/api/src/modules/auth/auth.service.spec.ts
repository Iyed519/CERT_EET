import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { CompteOauth } from '../../database/entities/compte-oauth.entity';
import { NiveauEtudes } from '../../database/enums/niveau-etudes.enum';
import { OauthProfile } from './auth.types';
/**
 * Tests unitaires d'AuthService (US-AUTH-01/03/04 + US-CPT-05).
 * Repositories, JwtService, RedisService et MailService remplacés par des faux.
 */
describe('AuthService', () => {
  let service: AuthService;
  const MOT_DE_PASSE_CORRECT = 'MotDePasseCorrect123!';
  let hashDuMotDePasse: string;
  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    // US-AUTH-15 : completeProfile vérifie l'existence domaine/établissement
    // via userRepository.manager.findOne (pas de repo injecté en plus).
    manager: { findOne: jest.fn() },
  };
  const mockRefreshTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  // US-AUTH-12 : AuthService délègue toute écriture d'audit à AuditService.record.
  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue({
      privateKeyPath: '/fake/path/private.pem',
      publicKeyPath: '/fake/path/public.pem',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    }),
  };
  const mockRedisService = {
    exists: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  const mockMailService = {
    sendVerificationEmail: jest.fn(),
  };
  // US-AUTH-14 : table de liaison identité externe -> compte.
  const mockCompteOauthRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const utilisateurActif = (): User =>
    ({
      id: 'user-uuid-1',
      email: 'test@cert-eet.local',
      motDePasseHash: hashDuMotDePasse,
      role: Role.APPRENANT,
      statut: StatutCompte.ACTIF,
      mfaActive: false,
      mfaSecret: null,
      derniereConnexion: null,
    }) as User;
  const sessionActive = (): RefreshToken =>
    ({
      id: 'rt-1',
      userId: 'user-uuid-1',
      familleId: 'famille-1',
      tokenHash: 'hash-quelconque',
      adresseIp: null,
      userAgent: null,
      active: true,
      dateExpiration: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }) as RefreshToken;
  beforeAll(async () => {
    hashDuMotDePasse = await bcrypt.hash(MOT_DE_PASSE_CORRECT, 4);
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.signAsync
      .mockResolvedValueOnce('fake-access-token')
      .mockResolvedValueOnce('fake-refresh-token');
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'user-uuid-1',
      type: 'refresh',
    });
    mockRedisService.exists.mockResolvedValue(false);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailService, useValue: mockMailService },
        {
          provide: getRepositoryToken(CompteOauth),
          useValue: mockCompteOauthRepository,
        },
      ],
    }).compile();
    service = moduleRef.get<AuthService>(AuthService);
    jest
      .spyOn(
        service as unknown as { getPrivateKey: () => string },
        'getPrivateKey',
      )
      .mockReturnValue('fake-private-key');
    jest
      .spyOn(
        service as unknown as { getPublicKey: () => string },
        'getPublicKey',
      )
      .mockReturnValue('fake-public-key');
  });
  it('est défini', () => {
    expect(service).toBeDefined();
  });
  describe('login — cas nominal', () => {
    it('émet les deux tokens et persiste la session pour un compte ACTIF avec le bon mot de passe', async () => {
      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValue(user);
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockUserRepository.save.mockResolvedValue(user);
      const result = await service.login(
        { email: user.email, password: MOT_DE_PASSE_CORRECT },
        { adresseIp: '127.0.0.1', userAgent: 'jest-test' },
      );
      if ('mfaRequired' in result) {
        throw new Error('login sans MFA ne doit pas renvoyer de défi');
      }
      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(result.user).toEqual({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      expect(mockRefreshTokenRepository.save).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
      // US-AUTH-12 : la connexion réussie est désormais tracée (action LOGIN).
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN',
          acteur: user.id,
          resultat: 'Succès',
        }),
      );
    });
  });
  describe('login — branches d erreur (securite par opacite, DS-01)', () => {
    it('rejette avec un message generique si l email est inconnu', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(
        service.login(
          { email: 'inconnu@cert-eet.local', password: 'peu-importe' },
          { adresseIp: null, userAgent: null },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
    it('rejette avec le meme message generique si le mot de passe est incorrect', async () => {
      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValue(user);
      await expect(
        service.login(
          { email: user.email, password: 'MauvaisMotDePasse!' },
          { adresseIp: null, userAgent: null },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
    it('rejette avec le meme message generique si le compte n est pas ACTIF', async () => {
      const user = { ...utilisateurActif(), statut: StatutCompte.DESACTIVE };
      mockUserRepository.findOne.mockResolvedValue(user);
      await expect(
        service.login(
          { email: user.email, password: MOT_DE_PASSE_CORRECT },
          { adresseIp: null, userAgent: null },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
    it('renvoie exactement le meme message pour email inconnu, mauvais mot de passe et compte inactif', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      let m1 = '';
      try {
        await service.login(
          { email: 'inconnu@cert-eet.local', password: 'x' },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        m1 = (e as UnauthorizedException).message;
      }
      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValueOnce(user);
      let m2 = '';
      try {
        await service.login(
          { email: user.email, password: 'mauvais' },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        m2 = (e as UnauthorizedException).message;
      }
      const userInactif = { ...user, statut: StatutCompte.DESACTIVE };
      mockUserRepository.findOne.mockResolvedValueOnce(userInactif);
      let m3 = '';
      try {
        await service.login(
          { email: user.email, password: MOT_DE_PASSE_CORRECT },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        m3 = (e as UnauthorizedException).message;
      }
      expect(m1).toBe(m2);
      expect(m2).toBe(m3);
    });
  });
  describe('refresh — US-AUTH-03 (rotation + reuse detection)', () => {
    const contexte = { adresseIp: null, userAgent: null };
    it('cas nominal : rafraîchit, brûle l ancien token et émet une nouvelle paire', async () => {
      const stored = sessionActive();
      mockRefreshTokenRepository.findOne.mockResolvedValue(stored);
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockRefreshTokenRepository.create.mockReturnValue({});
      const result = await service.refresh('vieux-refresh-token', contexte);
      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(stored.active).toBe(false);
      expect(mockRedisService.set).toHaveBeenCalled();
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });
    it('détection de rejeu : un token déjà consommé révoque la famille et lève 401', async () => {
      const stored = { ...sessionActive(), active: false };
      mockRefreshTokenRepository.findOne.mockResolvedValue(stored);
      await expect(
        service.refresh('token-deja-consomme', contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { familleId: stored.familleId, active: true },
        { active: false },
      );
    });
    it('rejette si le token est sur la denylist Redis', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      await expect(
        service.refresh('token-revoque', contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenRepository.findOne).not.toHaveBeenCalled();
    });
    it('rejette si l empreinte est inconnue en base', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);
      await expect(
        service.refresh('token-inconnu', contexte),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('rejette un token dont le type n est pas "refresh"', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        type: 'access',
      });
      await expect(
        service.refresh('un-access-token', contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenRepository.findOne).not.toHaveBeenCalled();
    });
    it('rejette un token à la signature invalide', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
      await expect(
        service.refresh('token-trafique', contexte),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('rejette un token expiré côté base', async () => {
      const stored = {
        ...sessionActive(),
        dateExpiration: new Date(Date.now() - 1000),
      };
      mockRefreshTokenRepository.findOne.mockResolvedValue(stored);
      await expect(
        service.refresh('token-expire', contexte),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('rejette si le compte n est plus ACTIF', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(sessionActive());
      mockUserRepository.findOne.mockResolvedValue({
        ...utilisateurActif(),
        statut: StatutCompte.DESACTIVE,
      });
      await expect(
        service.refresh('token-compte-desactive', contexte),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
  describe('logout — US-AUTH-04', () => {
    const contexte = { adresseIp: '127.0.0.1' };
    const accessClaims = (): { sub: string; jti: string; exp: number } => ({
      sub: 'user-uuid-1',
      jti: 'jti-access-1',
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    it('blackliste l access token, brûle le refresh et journalise LOGOUT', async () => {
      mockJwtService.verifyAsync.mockResolvedValue(accessClaims());
      mockRedisService.exists.mockResolvedValue(false);
      const stored = sessionActive();
      mockRefreshTokenRepository.findOne.mockResolvedValue(stored);
      mockRefreshTokenRepository.save.mockResolvedValue({});
      await service.logout('access-token', 'refresh-token', contexte);
      expect(mockRedisService.set).toHaveBeenCalled();
      expect(stored.active).toBe(false);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGOUT', resultat: 'Succès' }),
      );
      expect(mockAuditService.record).toHaveBeenCalledTimes(1);
    });
    it('idempotent : rejeu (access déjà blacklisté + refresh déjà inactif) ne journalise pas et ne lève pas', async () => {
      mockJwtService.verifyAsync.mockResolvedValue(accessClaims());
      mockRedisService.exists.mockResolvedValue(true);
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        ...sessionActive(),
        active: false,
      });
      await expect(
        service.logout('access-token', 'refresh-token', contexte),
      ).resolves.toBeUndefined();
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
    it('sans jetons : ne fait rien et ne lève pas', async () => {
      await expect(
        service.logout(null, null, contexte),
      ).resolves.toBeUndefined();
      expect(mockRefreshTokenRepository.findOne).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });
  describe('register — US-CPT-05 (auto-inscription)', () => {
    const dto: RegisterDto = {
      nom: 'Omri',
      prenom: 'Iyed',
      email: 'nouveau@cert-eet.local',
      password: 'MotDePasse123',
    };
    it('409 si l email est déjà utilisé — rien n est créé ni envoyé', async () => {
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      await expect(
        service.register(dto, { adresseIp: null }),
      ).rejects.toThrow(ConflictException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
    it('crée un APPRENANT EN_ATTENTE_ACTIVATION (rôle forcé), hache le mot de passe, stocke un jeton Redis 48h, envoie l email et journalise COMPTE_CREE', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((u) => u);
      mockUserRepository.save.mockResolvedValue({
        id: 'new-user-id',
        email: dto.email,
      });
      mockRedisService.set.mockResolvedValue(undefined);
      mockMailService.sendVerificationEmail.mockResolvedValue(undefined);
      await service.register(dto, { adresseIp: '127.0.0.1' });
      const createArg = mockUserRepository.create.mock.calls[0][0];
      expect(createArg.role).toBe(Role.APPRENANT);
      expect(createArg.statut).toBe(StatutCompte.EN_ATTENTE_ACTIVATION);
      expect(createArg.motDePasseHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, createArg.motDePasseHash)).toBe(
        true,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^verify-email:/),
        'new-user-id',
        48 * 3600,
      );
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        dto.email,
        expect.any(String),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMPTE_CREE', resultat: 'Succès' }),
      );
    });
  });
  describe('verifyEmail — US-CPT-05 (vérification email)', () => {
    it('400 si le jeton est absent de Redis (invalide/expiré/consommé)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      await expect(service.verifyEmail('jeton-x')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
    it('active le compte (ACTIF), consomme le jeton et journalise EMAIL_VERIFIE', async () => {
      const user = {
        ...utilisateurActif(),
        statut: StatutCompte.EN_ATTENTE_ACTIVATION,
      };
      mockRedisService.get.mockResolvedValue(user.id);
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      mockRedisService.del.mockResolvedValue(undefined);
      await service.verifyEmail('jeton-valide');
      expect(user.statut).toBe(StatutCompte.ACTIF);
      expect(mockRedisService.del).toHaveBeenCalledTimes(1);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMAIL_VERIFIE',
          resultat: 'Succès',
        }),
      );
    });
    it('400 si le compte lié au jeton n existe plus — la clé est nettoyée', async () => {
      mockRedisService.get.mockResolvedValue('ghost-id');
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.verifyEmail('jeton-fantome')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRedisService.del).toHaveBeenCalledTimes(1);
    });
  });
  describe('loginWithOauth — US-AUTH-14 (connexion sociale Google)', () => {
    // Profil normalisé tel que le renvoie GoogleStrategy.validate().
    const profil = (): OauthProfile => ({
      provider: 'google',
      providerId: 'google-sub-123',
      email: 'social@cert-eet.local',
      nom: 'Omri',
      prenom: 'Iyed',
    });
    const contexte = { adresseIp: '127.0.0.1', userAgent: 'jest' };

    it('identité déjà liée -> connexion directe, aucun compte ni lien créé', async () => {
      // Le lien existe déjà : on récupère l'utilisateur par lien.userId.
      mockCompteOauthRepository.findOne.mockResolvedValue({
        userId: 'user-uuid-1',
        provider: 'google',
        providerId: 'google-sub-123',
      });
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockUserRepository.save.mockResolvedValue(utilisateurActif());

      const res = await service.loginWithOauth(profil(), contexte);

      expect(res.accessToken).toBe('fake-access-token');
      expect(res.refreshToken).toBe('fake-refresh-token');
      // Aucune création : ni compte, ni nouveau lien.
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockCompteOauthRepository.create).not.toHaveBeenCalled();
      expect(mockCompteOauthRepository.save).not.toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONNEXION_OAUTH', resultat: 'Succès' }),
      );
    });

    it('email déjà connu (compte local) -> on lie l identité, sans créer de compte', async () => {
      // Pas de lien, mais un compte existe avec le même email.
      mockCompteOauthRepository.findOne.mockResolvedValue(null);
      const existant = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValue(existant);
      mockCompteOauthRepository.create.mockImplementation((l) => l);
      mockCompteOauthRepository.save.mockResolvedValue({});
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockUserRepository.save.mockResolvedValue(existant);

      const res = await service.loginWithOauth(profil(), contexte);

      expect(res.accessToken).toBe('fake-access-token');
      // Compte NON créé, mais lien créé vers le compte existant.
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      const lienArg = mockCompteOauthRepository.create.mock.calls[0][0];
      expect(lienArg).toEqual(
        expect.objectContaining({
          userId: 'user-uuid-1',
          provider: 'google',
          providerId: 'google-sub-123',
        }),
      );
      expect(mockCompteOauthRepository.save).toHaveBeenCalledTimes(1);
    });

    it('identité inconnue + email inconnu -> crée un APPRENANT ACTIF et lie l identité', async () => {
      // Ni lien, ni compte : création complète (email vérifié par Google).
      mockCompteOauthRepository.findOne.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((u) => u);
      mockUserRepository.save.mockImplementation((u) =>
        Promise.resolve({ ...u, id: 'new-oauth-user-id' }),
      );
      mockCompteOauthRepository.create.mockImplementation((l) => l);
      mockCompteOauthRepository.save.mockResolvedValue({});
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const res = await service.loginWithOauth(profil(), contexte);

      // Compte créé avec rôle APPRENANT forcé, statut ACTIF, sans mot de passe.
      const createArg = mockUserRepository.create.mock.calls[0][0];
      expect(createArg.role).toBe(Role.APPRENANT);
      expect(createArg.statut).toBe(StatutCompte.ACTIF);
      expect(createArg.motDePasseHash).toBeNull();
      expect(createArg.email).toBe('social@cert-eet.local');
      // Un lien est créé vers le compte fraîchement créé.
      expect(mockCompteOauthRepository.create).toHaveBeenCalledTimes(1);
      // Deux journaux : COMPTE_CREE puis CONNEXION_OAUTH.
      const actions = mockAuditService.record.mock.calls.map(
        (c) => c[0].action,
      );
      expect(actions).toEqual(
        expect.arrayContaining(['COMPTE_CREE', 'CONNEXION_OAUTH']),
      );
      expect(res.user.role).toBe(Role.APPRENANT);
    });

    it('compte lié mais DESACTIVE -> 401 (connexion refusée)', async () => {
      // L'identité pointe vers un compte désactivé : accès refusé.
      mockCompteOauthRepository.findOne.mockResolvedValue({
        userId: 'user-uuid-1',
        provider: 'google',
        providerId: 'google-sub-123',
      });
      mockUserRepository.findOne.mockResolvedValue({
        ...utilisateurActif(),
        statut: StatutCompte.DESACTIVE,
      });

      await expect(
        service.loginWithOauth(profil(), contexte),
      ).rejects.toThrow(UnauthorizedException);
      // Aucune session émise pour un compte refusé.
      expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
    });

    it('identité inconnue sans email fourni -> 401 (garde de sécurité)', async () => {
      // Sans lien ET sans email, impossible de rattacher/créer : refus.
      mockCompteOauthRepository.findOne.mockResolvedValue(null);
      const sansEmail: OauthProfile = { ...profil(), email: null };

      await expect(
        service.loginWithOauth(sansEmail, contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
  });
  describe('completeProfile — US-AUTH-15', () => {
    const contexte = { adresseIp: '127.0.0.1' };
    // Compte apprenant au profil vide (comme après inscription).
    const apprenantIncomplet = (): User =>
      ({
        id: 'user-uuid-1',
        email: 'appr@cert-eet.local',
        role: Role.APPRENANT,
        statut: StatutCompte.ACTIF,
        profilComplet: false,
        dateNaissance: null,
        niveauEtudes: null,
        domaineEtudesId: null,
        etablissementId: null,
        etablissementAutre: null,
      }) as unknown as User;
    it('401 si l utilisateur n existe pas', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(
        service.completeProfile(
          'inconnu',
          { dateNaissance: '2000-01-01', niveauEtudes: NiveauEtudes.LICENCE, enEtudes: false },
          contexte,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('400 si âge < 13 ans — rien enregistré', async () => {
      mockUserRepository.findOne.mockResolvedValue(apprenantIncomplet());
      await expect(
        service.completeProfile(
          'user-uuid-1',
          { dateNaissance: '2020-01-01', niveauEtudes: NiveauEtudes.BAC, enEtudes: false },
          contexte,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
    it('en études : domaine valide, sans établissement -> enregistre + PROFIL_COMPLETE', async () => {
      const user = apprenantIncomplet();
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.manager.findOne.mockResolvedValueOnce({ id: 'dom-1' }); // domaine trouvé
      mockUserRepository.save.mockResolvedValue(user);
      const res = await service.completeProfile(
        'user-uuid-1',
        {
          dateNaissance: '2003-05-19',
          niveauEtudes: NiveauEtudes.LICENCE,
          enEtudes: true,
          domaineEtudesId: 'dom-1',
        },
        contexte,
      );
      expect(user.profilComplet).toBe(true);
      expect(user.domaineEtudesId).toBe('dom-1');
      expect(user.etablissementId).toBeNull();
      expect(res.profilComplet).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROFIL_COMPLETE', resultat: 'Succès' }),
      );
    });
    it('en études : domaine inconnu -> 400', async () => {
      mockUserRepository.findOne.mockResolvedValue(apprenantIncomplet());
      mockUserRepository.manager.findOne.mockResolvedValueOnce(null); // domaine absent
      await expect(
        service.completeProfile(
          'user-uuid-1',
          {
            dateNaissance: '2003-05-19',
            niveauEtudes: NiveauEtudes.LICENCE,
            enEtudes: true,
            domaineEtudesId: 'dom-x',
          },
          contexte,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
    it('plus en études : domaine + établissement remis à null', async () => {
      const user = { ...apprenantIncomplet(), domaineEtudesId: 'x', etablissementId: 'y' } as User;
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      await service.completeProfile(
        'user-uuid-1',
        { dateNaissance: '1999-01-01', niveauEtudes: NiveauEtudes.MASTERE, enEtudes: false },
        contexte,
      );
      expect(user.domaineEtudesId).toBeNull();
      expect(user.etablissementId).toBeNull();
      expect(user.etablissementAutre).toBeNull();
      expect(user.profilComplet).toBe(true);
    });
  });
  describe('getMe — US-AUTH-15', () => {
    it('renvoie le profil avec âge dérivé', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'appr@cert-eet.local',
        role: Role.APPRENANT,
        profilComplet: true,
        dateNaissance: '2000-01-01',
        niveauEtudes: NiveauEtudes.LICENCE,
        domaineEtudesId: null,
        etablissementId: null,
        etablissementAutre: null,
      } as unknown as User);
      const res = await service.getMe('user-uuid-1');
      expect(res.profilComplet).toBe(true);
      expect(res.age).toBeGreaterThanOrEqual(24);
      expect(res.role).toBe(Role.APPRENANT);
    });
    it('401 si l utilisateur n existe pas', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.getMe('inconnu')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('MFA — enrôlement (US-AUTH-09)', () => {
    const contexte = { adresseIp: '127.0.0.1' };

    it('mfaSetup : génère un secret en attente (Redis) + QR, sans écrire en base', async () => {
      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValue(user);
      const res = await service.mfaSetup(user.id);
      expect(res.otpauthUrl).toContain('otpauth://totp/');
      expect(res.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^mfa:setup:/),
        expect.any(String),
        expect.any(Number),
      );
      // Pas de secret en base tant que l'activation n'est pas confirmée.
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('mfaSetup : 409 si la MFA est déjà active', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...utilisateurActif(),
        mfaActive: true,
      });
      await expect(service.mfaSetup('user-uuid-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('mfaEnable : code valide -> mfa_active=true, secret persisté, clé consommée, audit MFA_ACTIVEE', async () => {
      const secret = authenticator.generateSecret();
      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValue(user);
      mockRedisService.get.mockResolvedValue(secret);
      mockUserRepository.save.mockResolvedValue(user);
      await service.mfaEnable(
        user.id,
        authenticator.generate(secret),
        contexte,
      );
      expect(user.mfaActive).toBe(true);
      expect(user.mfaSecret).toBe(secret);
      expect(mockRedisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^mfa:setup:/),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MFA_ACTIVEE', resultat: 'Succès' }),
      );
    });

    it('mfaEnable : 400 si aucune activation en cours (Redis vide)', async () => {
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      mockRedisService.get.mockResolvedValue(null);
      await expect(
        service.mfaEnable('user-uuid-1', '123456', contexte),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('mfaEnable : 400 si le code est invalide', async () => {
      const secret = authenticator.generateSecret();
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      mockRedisService.get.mockResolvedValue(secret);
      const codeInvalide = authenticator.generate(
        authenticator.generateSecret(),
      );
      await expect(
        service.mfaEnable('user-uuid-1', codeInvalide, contexte),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('mfaDisable : code valide -> mfa_active=false, secret effacé, audit MFA_DESACTIVEE', async () => {
      const secret = authenticator.generateSecret();
      const user = { ...utilisateurActif(), mfaActive: true, mfaSecret: secret };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      await service.mfaDisable(
        user.id,
        authenticator.generate(secret),
        contexte,
      );
      expect(user.mfaActive).toBe(false);
      expect(user.mfaSecret).toBeNull();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_DESACTIVEE',
          resultat: 'Succès',
        }),
      );
    });

    it('mfaDisable : 400 si la MFA n est pas active', async () => {
      mockUserRepository.findOne.mockResolvedValue(utilisateurActif());
      await expect(
        service.mfaDisable('user-uuid-1', '123456', contexte),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('MFA — connexion (US-AUTH-02)', () => {
    const contexte = { adresseIp: '127.0.0.1', userAgent: 'jest' };

    it('login : compte MFA actif -> mfaRequired + mfaToken, AUCUN jeton émis', async () => {
      const user = { ...utilisateurActif(), mfaActive: true };
      mockUserRepository.findOne.mockResolvedValue(user);
      const res = await service.login(
        { email: user.email, password: MOT_DE_PASSE_CORRECT },
        contexte,
      );
      if (!('mfaRequired' in res)) {
        throw new Error('un compte MFA actif doit renvoyer un défi');
      }
      expect(res.mfaRequired).toBe(true);
      expect(typeof res.mfaToken).toBe('string');
      // Session MFA temporaire créée ; aucun jeton signé ; aucun audit LOGIN.
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^mfa:/),
        user.id,
        expect.any(Number),
      );
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN' }),
      );
    });

    it('mfaVerify : session + code valides -> jetons émis, session supprimée (usage unique), audit LOGIN', async () => {
      const secret = authenticator.generateSecret();
      const user = { ...utilisateurActif(), mfaActive: true, mfaSecret: secret };
      mockRedisService.get.mockResolvedValue(user.id);
      mockUserRepository.findOne.mockResolvedValue(user);
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockUserRepository.save.mockResolvedValue(user);
      const res = await service.mfaVerify(
        'mfa-token-xyz',
        authenticator.generate(secret),
        contexte,
      );
      expect(res.accessToken).toBe('fake-access-token');
      expect(res.refreshToken).toBe('fake-refresh-token');
      expect(mockRedisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^mfa:/),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', resultat: 'Succès' }),
      );
    });

    it('mfaVerify : 401 si le mfaToken est inconnu/expiré (Redis vide)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      await expect(
        service.mfaVerify('mfa-token-absent', '123456', contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('mfaVerify : 401 si le code est invalide (session NON supprimée)', async () => {
      const secret = authenticator.generateSecret();
      const user = { ...utilisateurActif(), mfaActive: true, mfaSecret: secret };
      mockRedisService.get.mockResolvedValue(user.id);
      mockUserRepository.findOne.mockResolvedValue(user);
      const codeInvalide = authenticator.generate(
        authenticator.generateSecret(),
      );
      await expect(
        service.mfaVerify('mfa-token-xyz', codeInvalide, contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRedisService.del).not.toHaveBeenCalled();
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { RedisService } from '../../redis/redis.service';

/**
 * Tests unitaires d'AuthService (US-AUTH-01 + US-AUTH-03).
 *
 * On isole AuthService : repositories TypeORM, JwtService et RedisService
 * sont REMPLACÉS par des faux (jest.fn()). But : tester la LOGIQUE (qui peut
 * se connecter/rafraîchir et pourquoi) vite, sans Docker/Postgres/Redis. La
 * vraie signature RS256 et la vraie base sont couvertes par le test e2e.
 */
describe('AuthService', () => {
  let service: AuthService;
  const MOT_DE_PASSE_CORRECT = 'MotDePasseCorrect123!';
  let hashDuMotDePasse: string;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const mockRefreshTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
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

  // Session active, non expirée, appartenant à une famille — point de départ
  // du cas nominal de refresh.
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

    // Valeurs par défaut pour le refresh (surchargées dans chaque test au besoin).
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
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);

    // getPrivateKey()/getPublicKey() lisent des fichiers réels sur disque :
    // inexistants en test unitaire, on les remplace par des chaînes factices.
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

      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(result.user).toEqual({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      expect(mockRefreshTokenRepository.save).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
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
      const user = {
        ...utilisateurActif(),
        statut: StatutCompte.DESACTIVE,
      };
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
      let messageEmailInconnu = '';
      try {
        await service.login(
          { email: 'inconnu@cert-eet.local', password: 'x' },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        messageEmailInconnu = (e as UnauthorizedException).message;
      }

      const user = utilisateurActif();
      mockUserRepository.findOne.mockResolvedValueOnce(user);
      let messageMauvaisMdp = '';
      try {
        await service.login(
          { email: user.email, password: 'mauvais' },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        messageMauvaisMdp = (e as UnauthorizedException).message;
      }

      const userInactif = { ...user, statut: StatutCompte.DESACTIVE };
      mockUserRepository.findOne.mockResolvedValueOnce(userInactif);
      let messageInactif = '';
      try {
        await service.login(
          { email: user.email, password: MOT_DE_PASSE_CORRECT },
          { adresseIp: null, userAgent: null },
        );
      } catch (e) {
        messageInactif = (e as UnauthorizedException).message;
      }

      expect(messageEmailInconnu).toBe(messageMauvaisMdp);
      expect(messageMauvaisMdp).toBe(messageInactif);
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
      // L ancien token est brûlé (inactif) ...
      expect(stored.active).toBe(false);
      // ... et inscrit sur la denylist Redis.
      expect(mockRedisService.set).toHaveBeenCalled();
      // Une nouvelle session est persistée.
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });

    it('détection de rejeu : un token déjà consommé (active=false) révoque toute la famille et lève 401', async () => {
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
      // On n a même pas eu besoin d aller en base.
      expect(mockRefreshTokenRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejette si l empreinte est inconnue en base', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);
      await expect(
        service.refresh('token-inconnu', contexte),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un token dont le type n est pas "refresh" (ex : un access token présenté)', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        type: 'access',
      });
      await expect(
        service.refresh('un-access-token', contexte),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejette un token à la signature invalide (verifyAsync échoue)', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
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
});

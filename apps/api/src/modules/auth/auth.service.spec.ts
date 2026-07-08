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

/**
 * Tests unitaires d'AuthService (US-AUTH-01).
 *
 * Contrairement à un test e2e (qui démarre toute l'appli et parle à une
 * vraie base Postgres), ce test isole AuthService : les repositories
 * TypeORM et JwtService sont REMPLACÉS par des faux objets (jest.fn()).
 * Objectif : tester la LOGIQUE MÉTIER (qui a le droit de se connecter et
 * pourquoi) rapidement, sans dépendre de Docker/Postgres.
 *
 * Le mot de passe réel utilisé dans les tests est haché avec un coût
 * bcrypt volontairement bas (4 au lieu de 12) : on veut un VRAI hash
 * bcrypt valide pour que bcrypt.compare() se comporte normalement, mais
 * sans payer le coût de calcul de 12 à chaque exécution de la suite de
 * tests (12 est pour la prod, pas pour des milliers de tests unitaires).
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
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  const mockConfigService = {
    // AuthService appelle configService.getOrThrow<JwtConfig>('jwt') dans
    // son constructeur : on renvoie donc un faux JwtConfig cohérent.
    getOrThrow: jest.fn().mockReturnValue({
      privateKeyPath: '/fake/path/private.pem',
      publicKeyPath: '/fake/path/public.pem',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    }),
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

  beforeAll(async () => {
    hashDuMotDePasse = await bcrypt.hash(MOT_DE_PASSE_CORRECT, 4);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Par défaut, signAsync renvoie une chaîne factice différente à chaque
    // appel — suffisant pour vérifier qu'un token est émis, sans avoir
    // besoin d'une vraie clé RS256 en test unitaire (ça, c'est le rôle du
    // test e2e).
    mockJwtService.signAsync
      .mockResolvedValueOnce('fake-access-token')
      .mockResolvedValueOnce('fake-refresh-token');

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
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);

    // AuthService.getPrivateKey() lit un fichier sur disque (fs.readFileSync).
    // En test unitaire, aucune vraie clé n'existe à ce chemin : on
    // remplace donc la méthode privée pour renvoyer une chaîne factice.
    // (Le VRAI chargement de clé est couvert par le test e2e, qui utilise
    // les clés générées par CI/Docker.)
    // getPrivateKey() est une méthode PRIVÉE d'AuthService : TypeScript ne
    // laisse normalement pas jest.spyOn() la cibler depuis l'extérieur.
    // Le cast vers un type structurel local (juste "a une méthode
    // getPrivateKey qui renvoie une string") est plus sûr qu'un `any` :
    // il documente précisément ce dont ce test a besoin, sans désactiver
    // la vérification de type sur tout le reste de l'objet `service`.
    jest
      .spyOn(
        service as unknown as { getPrivateKey: () => string },
        'getPrivateKey',
      )
      .mockReturnValue('fake-private-key');
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
      // La session doit être persistée (table refresh_tokens).
      expect(mockRefreshTokenRepository.save).toHaveBeenCalledTimes(1);
      // derniereConnexion doit être mise à jour.
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

      // Aucun token ne doit être émis.
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
      // Ce test vérifie explicitement l'exigence "sécurité par opacité" du
      // backlog : un attaquant ne doit JAMAIS pouvoir distinguer les trois
      // cas d'échec à partir du message renvoyé.
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
});
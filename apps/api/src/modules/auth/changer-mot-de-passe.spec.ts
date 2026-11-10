import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  AuthService,
  CODE_MOT_DE_PASSE_ACTUEL_INCORRECT,
  CODE_SANS_MOT_DE_PASSE_LOCAL,
} from './auth.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CompteOauth } from '../../database/entities/compte-oauth.entity';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { emisAvantMarqueur } from './guards/jwt-auth.guard';

/**
 * US-AUTH-08 — Changer son mot de passe : règles du service (verrou, refus,
 * révocation de toutes les sessions en base ET dans Redis, audit, email) et
 * comparaison du marqueur d'invalidation à la milliseconde.
 */
describe('AuthService.changerMotDePasse (US-AUTH-08)', () => {
  const ACTUEL = 'AncienPasse123';
  const NOUVEAU = 'NouveauPasse456';
  let hashActuel: string;
  let service: AuthService;

  const em = { query: jest.fn() };
  const mockUserRepository = {
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
    },
  };
  const mockRefreshTokenRepository = { find: jest.fn(), update: jest.fn() };
  const mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const mockRedis = { set: jest.fn(), get: jest.fn(), exists: jest.fn(), del: jest.fn() };
  const mockMail = { sendMotDePasseModifieEmail: jest.fn() };
  const claims = {
    sub: 'user-1',
    jti: 'jti-courant',
    exp: Math.floor(Date.now() / 1000) + 600,
  };

  const ligne = (extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
    id: 'user-1',
    email: 'u@cert-eet.local',
    prenom: 'Iyed',
    statut: StatutCompte.ACTIF,
    mot_de_passe_hash: hashActuel,
    ...extra,
  });

  beforeAll(async () => {
    hashActuel = await bcrypt.hash(ACTUEL, 4);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRefreshTokenRepository.find.mockResolvedValue([
      { tokenHash: 'h1', dateExpiration: new Date(Date.now() + 3_600_000) },
      { tokenHash: 'h2', dateExpiration: new Date(Date.now() + 7_200_000) },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepository },
        { provide: getRepositoryToken(CompteOauth), useValue: {} },
        { provide: AuditService, useValue: mockAudit },
        { provide: JwtService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (): Record<string, number> => ({
              accessTokenExpiresIn: 900,
              refreshTokenExpiresIn: 604800,
            }),
          },
        },
        { provide: RedisService, useValue: mockRedis },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('refuse (400) un nouveau mot de passe identique, sans rien lire en base', async () => {
    await expect(
      service.changerMotDePasse(
        claims,
        { motDePasseActuel: ACTUEL, nouveauMotDePasse: ACTUEL },
        { adresseIp: null },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('verrouille la ligne de l’utilisateur (FOR UPDATE)', async () => {
    em.query.mockResolvedValueOnce([ligne()]).mockResolvedValueOnce([]);
    await service.changerMotDePasse(
      claims,
      { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU },
      { adresseIp: null },
    );
    expect(em.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(em.query.mock.calls[0][1]).toEqual(['user-1']);
  });

  it('mot de passe actuel incorrect : 401 avec code stable, audit Échec, rien de modifié ni révoqué', async () => {
    em.query.mockResolvedValueOnce([ligne()]);
    const promesse = service.changerMotDePasse(
      claims,
      { motDePasseActuel: 'Mauvais123', nouveauMotDePasse: NOUVEAU },
      { adresseIp: '10.0.0.1' },
    );
    await expect(promesse).rejects.toThrow(UnauthorizedException);
    await promesse.catch((e: UnauthorizedException) => {
      expect(e.getResponse()).toMatchObject({ code: CODE_MOT_DE_PASSE_ACTUEL_INCORRECT });
    });
    expect(em.query).toHaveBeenCalledTimes(1);
    expect(mockRefreshTokenRepository.update).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MDP_CHANGE', resultat: 'Échec', acteur: 'user-1' }),
    );
    expect(mockMail.sendMotDePasseModifieEmail).not.toHaveBeenCalled();
  });

  it('compte sans mot de passe local (OAuth) : 409 avec code stable', async () => {
    em.query.mockResolvedValueOnce([ligne({ mot_de_passe_hash: null })]);
    const promesse = service.changerMotDePasse(
      claims,
      { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU },
      { adresseIp: null },
    );
    await expect(promesse).rejects.toThrow(ConflictException);
    await promesse.catch((e: ConflictException) => {
      expect(e.getResponse()).toMatchObject({ code: CODE_SANS_MOT_DE_PASSE_LOCAL });
    });
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('compte non actif : 401, rien de modifié', async () => {
    em.query.mockResolvedValueOnce([ligne({ statut: StatutCompte.DESACTIVE })]);
    await expect(
      service.changerMotDePasse(
        claims,
        { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU },
        { adresseIp: null },
      ),
    ).rejects.toThrow(/Non authentifié/);
    expect(em.query).toHaveBeenCalledTimes(1);
  });

  it('nominal : nouveau hash bcrypt, toutes les sessions révoquées (base + Redis), jeton courant révoqué, audit, email', async () => {
    em.query.mockResolvedValueOnce([ligne()]).mockResolvedValueOnce([]);
    const avant = Date.now();
    const res = await service.changerMotDePasse(
      claims,
      { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU },
      { adresseIp: '10.0.0.1' },
    );
    expect(res).toEqual({ sessionsRevoquees: 2 });
    const [sqlMaj, params] = em.query.mock.calls[1] as [string, string[]];
    expect(sqlMaj).toMatch(/UPDATE users SET mot_de_passe_hash/);
    expect(await bcrypt.compare(NOUVEAU, params[1])).toBe(true);
    expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
      { userId: 'user-1', active: true },
      { active: false },
    );
    expect(mockRedis.set).toHaveBeenCalledWith('denylist:refresh:h1', '1', expect.any(Number));
    expect(mockRedis.set).toHaveBeenCalledWith('denylist:refresh:h2', '1', expect.any(Number));
    const marqueur = mockRedis.set.mock.calls.find((c) => c[0] === 'sessions-valid-after:user-1');
    expect(Number(marqueur?.[1])).toBeGreaterThanOrEqual(avant);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'denylist:access:jti-courant',
      '1',
      expect.any(Number),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MDP_CHANGE',
        resultat: 'Succès',
        detailsAvantApres: { sessionsRevoquees: 2 },
      }),
    );
    expect(mockMail.sendMotDePasseModifieEmail).toHaveBeenCalledWith('u@cert-eet.local', {
      prenom: 'Iyed',
    });
  });

  it('un email en échec ne fait pas échouer le changement', async () => {
    em.query.mockResolvedValueOnce([ligne()]).mockResolvedValueOnce([]);
    mockMail.sendMotDePasseModifieEmail.mockRejectedValueOnce(new Error('SMTP KO'));
    await expect(
      service.changerMotDePasse(
        claims,
        { motDePasseActuel: ACTUEL, nouveauMotDePasse: NOUVEAU },
        { adresseIp: null },
      ),
    ).resolves.toEqual({ sessionsRevoquees: 2 });
  });
});

describe('emisAvantMarqueur (US-AUTH-08)', () => {
  it('compare à la milliseconde quand le jeton porte tms', () => {
    expect(
      emisAvantMarqueur({ iat: 1_700_000_000, tms: 1_700_000_000_100 }, 1_700_000_000_500),
    ).toBe(true);
    expect(
      emisAvantMarqueur({ iat: 1_700_000_000, tms: 1_700_000_000_900 }, 1_700_000_000_500),
    ).toBe(false);
  });
  it('utilise iat × 1000 pour un jeton sans tms', () => {
    expect(emisAvantMarqueur({ iat: 1_700_000_000 }, 1_700_000_000_500)).toBe(true);
    expect(emisAvantMarqueur({ iat: 1_700_000_001 }, 1_700_000_000_500)).toBe(false);
  });
  it('reconnaît un ancien marqueur en secondes', () => {
    expect(emisAvantMarqueur({ iat: 1000 }, 2000)).toBe(true);
    expect(emisAvantMarqueur({ iat: 3000, tms: 3_000_000 }, 2000)).toBe(false);
  });
});

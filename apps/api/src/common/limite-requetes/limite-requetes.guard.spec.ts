import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimiteRequetesGuard } from './limite-requetes.guard';
import { cleLimite, limiteDepassee, premierRefusLimite } from './limite-requetes.regles';

/** US-AUTH-06 / US-AUTH-13 — limitation de débit générique par IP. */
describe('LimiteRequetesGuard', () => {
  const redis = { incrementer: jest.fn() };
  const audit = { record: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const setHeader = jest.fn();
  const guard = new LimiteRequetesGuard(
    reflector as unknown as Reflector,
    redis as never,
    audit as never,
  );
  const ctx = {
    getHandler: (): null => null,
    getClass: (): null => null,
    switchToHttp: () => ({
      getRequest: (): Record<string, string> => ({ ip: '::ffff:10.0.0.7', originalUrl: '/api/auth/forgot-password' }),
      getResponse: (): { setHeader: jest.Mock } => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  const LIMITE = { nom: 'mdp-oublie', limite: 5, fenetreSecondes: 900 };

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(LIMITE);
  });

  it('règles : clé normalisée, dépassement strict, premier refus seul', () => {
    expect(cleLimite('login', '::ffff:1.2.3.4')).toBe('limite:login:1.2.3.4');
    expect(cleLimite('login', undefined)).toBe('limite:login:inconnue');
    expect(limiteDepassee(5, 5)).toBe(false);
    expect(limiteDepassee(6, 5)).toBe(true);
    expect(premierRefusLimite(6, 5)).toBe(true);
    expect(premierRefusLimite(7, 5)).toBe(false);
  });

  it('route sans limite déclarée : passe sans toucher Redis', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redis.incrementer).not.toHaveBeenCalled();
  });

  it('sous la limite : passe ; compteur par nom et IP, fenêtre de la route', async () => {
    redis.incrementer.mockResolvedValue({ compte: 5, resteSecondes: 100 });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redis.incrementer).toHaveBeenCalledWith('limite:mdp-oublie:10.0.0.7', 900);
  });

  it('premier dépassement : 429, Retry-After, audit LIMITE_REQUETES_ATTEINTE', async () => {
    redis.incrementer.mockResolvedValue({ compte: 6, resteSecondes: 321 });
    const promesse = guard.canActivate(ctx);
    await expect(promesse).rejects.toThrow(HttpException);
    await promesse.catch((e: HttpException) => expect(e.getStatus()).toBe(429));
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '321');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LIMITE_REQUETES_ATTEINTE',
        adresseIp: '::ffff:10.0.0.7',
        detailsAvantApres: expect.objectContaining({ limite: 'mdp-oublie', maximum: 5 }),
      }),
    );
  });

  it('dépassements suivants : 429 sans nouvel audit', async () => {
    redis.incrementer.mockResolvedValue({ compte: 9, resteSecondes: 10 });
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('Redis injoignable : la route reste ouverte', async () => {
    redis.incrementer.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

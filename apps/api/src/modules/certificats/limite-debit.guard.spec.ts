import { ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { LimiteDebitGuard } from './limite-debit.guard';

/** LimiteDebitGuard (US-CERT-05) : Redis, configuration et audit simulés. */
describe('LimiteDebitGuard (US-CERT-05)', () => {
  const incrementer = jest.fn();
  const record = jest.fn();
  const setHeader = jest.fn();
  const garde = new LimiteDebitGuard(
    { incrementer } as unknown as RedisService,
    { getOrThrow: () => ({ limiteParMinute: 20 }) } as unknown as ConfigService,
    { record } as unknown as AuditService,
  );
  const requete = { ip: '::ffff:203.0.113.7', originalUrl: '/api/verification/x' };
  const reponse = { setHeader };
  const http = { getRequest: (): unknown => requete, getResponse: (): unknown => reponse };
  const contexte = { switchToHttp: (): unknown => http } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    record.mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sous la limite : passe, compteur par IP sur une minute', async () => {
    incrementer.mockResolvedValue({ compte: 20, resteSecondes: 30 });
    await expect(garde.canActivate(contexte)).resolves.toBe(true);
    expect(incrementer).toHaveBeenCalledWith('limite:verification:203.0.113.7', 60);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('premier dépassement : 429, Retry-After, tracé une fois', async () => {
    incrementer.mockResolvedValue({ compte: 21, resteSecondes: 30 });
    const refus = garde.canActivate(contexte);
    await expect(refus).rejects.toThrow(HttpException);
    await expect(garde.canActivate(contexte)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VERIFICATION_LIMITE_ATTEINTE',
        acteur: null,
        adresseIp: '::ffff:203.0.113.7',
        resultat: 'Échec',
      }),
    );
  });

  it('dépassements suivants : 429 sans nouvel audit', async () => {
    incrementer.mockResolvedValue({ compte: 25, resteSecondes: 10 });
    await expect(garde.canActivate(contexte)).rejects.toThrow(
      'Trop de vérifications depuis votre connexion : réessayez dans une minute.',
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('audit en échec : le refus reste un 429', async () => {
    incrementer.mockResolvedValue({ compte: 21, resteSecondes: 30 });
    record.mockRejectedValue(new Error('audit'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(garde.canActivate(contexte)).rejects.toMatchObject({ status: 429 });
  });

  it('Redis injoignable : la vérification reste ouverte, incident journalisé', async () => {
    incrementer.mockRejectedValue(new Error('ECONNREFUSED'));
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(garde.canActivate(contexte)).resolves.toBe(true);
    expect(erreur).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });
});

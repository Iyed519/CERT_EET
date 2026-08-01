import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Tests unitaires d'AuditInterceptor (US-AUTH-12).
 *
 * Je simule ExecutionContext / CallHandler. Vérifie : route non annotée =>
 * aucun audit ; route @Audit en succès => record('Succès') ; en échec =>
 * record('Échec') + relais de l'erreur ; un échec d'écriture d'audit ne casse
 * pas la requête (best-effort).
 */
describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };

  const contexte = (
    user?: { sub: string },
    ip = '10.0.0.1',
  ): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user, ip }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector = new Reflector();
    interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
  });

  it('route non annotée : ne journalise pas', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const res = await firstValueFrom(interceptor.intercept(contexte(), next));

    expect(res).toEqual({ ok: true });
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('route @Audit en succès : record(acteur, IP, "Succès")', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('AUDIT_CONSULTE');
    const next: CallHandler = { handle: () => of([{ id: 1 }]) };

    await firstValueFrom(
      interceptor.intercept(contexte({ sub: 'admin-1' }), next),
    );

    expect(auditService.record).toHaveBeenCalledWith({
      action: 'AUDIT_CONSULTE',
      acteur: 'admin-1',
      adresseIp: '10.0.0.1',
      resultat: 'Succès',
    });
  });

  it('route @Audit en échec : record(..., "Échec") et relaie l erreur', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('AUDIT_CONSULTE');
    const erreur = new Error('boom');
    const next: CallHandler = { handle: () => throwError(() => erreur) };

    await expect(
      firstValueFrom(
        interceptor.intercept(contexte({ sub: 'admin-1' }), next),
      ),
    ).rejects.toBe(erreur);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUDIT_CONSULTE', resultat: 'Échec' }),
    );
  });

  it('acteur null si aucun utilisateur (route publique annotée)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('LOGIN');
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await firstValueFrom(interceptor.intercept(contexte(undefined), next));

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ acteur: null }),
    );
  });

  it('un échec d écriture d audit ne casse pas la requête (best-effort)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('AUDIT_CONSULTE');
    auditService.record.mockRejectedValueOnce(new Error('db down'));
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const res = await firstValueFrom(
      interceptor.intercept(contexte({ sub: 'admin-1' }), next),
    );
    // La réponse métier est renvoyée intacte malgré l'échec d'audit.
    expect(res).toEqual({ ok: true });
  });
});

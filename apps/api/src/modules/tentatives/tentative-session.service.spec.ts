import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditService } from '../audit/audit.service';
import { TentativeSessionService } from './tentative-session.service';

/**
 * Tests unitaires du service de verrou de session (US-QCM-10) : décision,
 * adoption écrite dans la transaction, session ouverte lue dans
 * `refresh_tokens`, miroir Redis jamais bloquant, refus audité puis 409.
 */
describe('TentativeSessionService', () => {
  const S1 = 's0000000-0000-4000-8000-000000000001';
  const S2 = 's0000000-0000-4000-8000-000000000002';

  let service: TentativeSessionService;
  let client: { set: jest.Mock; del: jest.Mock };
  let auditService: { record: jest.Mock };
  let manager: { query: jest.Mock; update: jest.Mock };
  let ouverte: boolean;

  const tentative = (sessionId: string | null): TentativeQcm =>
    ({ id: 't-1', qcmId: 'q-1', sessionId }) as TentativeQcm;

  beforeEach(async () => {
    ouverte = true;
    client = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    manager = {
      query: jest.fn(() => Promise.resolve([{ ouverte }])),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeSessionService,
        { provide: REDIS_CLIENT, useValue: client },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = moduleRef.get(TentativeSessionService);
  });

  const controler = (t: TentativeQcm, blocage = true): Promise<string> =>
    service.controler(manager as never, t, S2, blocage);

  describe('controler', () => {
    it('même session : autorisee, sans requête', async () => {
      await expect(service.controler(manager as never, tentative(S1), S1, true)).resolves.toBe(
        'autorisee',
      );
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('autre session ouverte : refusee, rien écrit', async () => {
      await expect(controler(tentative(S1))).resolves.toBe('refusee');
      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('refresh_tokens'), [S1]);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('autre session terminée : adoptee, session_id réécrit dans la transaction', async () => {
      ouverte = false;
      const t = tentative(S1);
      await expect(controler(t)).resolves.toBe('adoptee');
      expect(manager.update).toHaveBeenCalledWith(TentativeQcm, { id: 't-1' }, { sessionId: S2 });
      expect(t.sessionId).toBe(S2);
    });

    it('tentative sans session : adoptee sans consulter refresh_tokens', async () => {
      await expect(controler(tentative(null))).resolves.toBe('adoptee');
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(TentativeQcm, { id: 't-1' }, { sessionId: S2 });
    });

    it('blocage désactivé : autorisee, rien lu ni écrit', async () => {
      await expect(controler(tentative(S1), false)).resolves.toBe('autorisee');
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  it('sessionOuverte : famille active et non expirée, horloge de la base', async () => {
    await service.sessionOuverte(manager as never, S1);
    const [sql] = manager.query.mock.calls[0] as [string];
    expect(sql).toContain('famille_id = $1');
    expect(sql).toContain('active = true');
    expect(sql).toContain('date_expiration > clock_timestamp()');
  });

  describe('miroir Redis', () => {
    it('pose la clé avec PXAT = échéance', async () => {
      const limite = new Date(Date.now() + 60_000);
      await service.armerMiroir('a-1', 'q-1', S1, limite);
      expect(client.set).toHaveBeenCalledWith('session_qcm:a-1:q-1', S1, 'PXAT', limite.getTime());
    });

    it('échéance passée ou session absente : rien posé', async () => {
      await service.armerMiroir('a-1', 'q-1', S1, new Date(Date.now() - 1));
      await service.armerMiroir('a-1', 'q-1', null, new Date(Date.now() + 60_000));
      expect(client.set).not.toHaveBeenCalled();
    });

    it('panne Redis : jamais remontée', async () => {
      client.set.mockRejectedValue(new Error('redis HS'));
      client.del.mockRejectedValue(new Error('redis HS'));
      await expect(
        service.armerMiroir('a-1', 'q-1', S1, new Date(Date.now() + 60_000)),
      ).resolves.toBeUndefined();
      await expect(service.effacerMiroir('a-1', 'q-1')).resolves.toBeUndefined();
    });
  });

  describe('refuser', () => {
    const REFUS = {
      apprenantId: 'a-1',
      tentativeId: 't-1',
      qcmId: 'q-1',
      adresseIp: '127.0.0.1',
      route: '/api/tentatives/t-1',
    };

    it('audit SESSION_MULTIPLE_REFUSEE puis 409 session_active_ailleurs', async () => {
      const erreur = await service.refuser(REFUS).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ConflictException);
      expect((erreur as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'Vous passez déjà ce QCM sur un autre appareil.',
        raison: 'session_active_ailleurs',
      });
      expect(auditService.record).toHaveBeenCalledWith({
        action: 'SESSION_MULTIPLE_REFUSEE',
        acteur: 'a-1',
        cible: 't-1',
        adresseIp: '127.0.0.1',
        resultat: 'Échec',
        detailsAvantApres: {
          qcmId: 'q-1',
          raison: 'session_active_ailleurs',
          route: '/api/tentatives/t-1',
        },
      });
    });

    it('audit en panne : le 409 part quand même', async () => {
      auditService.record.mockRejectedValue(new Error('audit HS'));
      await expect(service.refuser(REFUS)).rejects.toThrow(ConflictException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from '../../database/entities/audit-log.entity';

/**
 * Tests unitaires d'AuditService (US-AUTH-12).
 *
 * Le repository AuditLog est remplacé par un faux : je vérifie que record()
 * construit UNE entrée normalisée (acteur -> userId, champs absents -> null) et
 * l'écrit une seule fois, et que list() construit les bons filtres + pagination
 * + tri DESC. Aucune opération d'update/delete n'est exposée.
 */
describe('AuditService', () => {
  let service: AuditService;
  const mockAuditLogRepository = {
    create: jest.fn((x) => x),
    save: jest.fn().mockResolvedValue(undefined),
    findAndCount: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
      ],
    }).compile();
    service = moduleRef.get<AuditService>(AuditService);
  });

  it('est défini', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('mappe acteur -> userId et écrit une seule entrée', async () => {
      await service.record({
        action: 'ROLE_CHANGE',
        acteur: 'admin-1',
        cible: 'user-2',
        adresseIp: '127.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: {
          ancienRole: 'APPRENANT',
          nouveauRole: 'FORMATEUR',
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith({
        userId: 'admin-1',
        action: 'ROLE_CHANGE',
        cible: 'user-2',
        adresseIp: '127.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: {
          ancienRole: 'APPRENANT',
          nouveauRole: 'FORMATEUR',
        },
      });
      expect(mockAuditLogRepository.save).toHaveBeenCalledTimes(1);
    });

    it('normalise les champs absents à null (action minimale)', async () => {
      await service.record({ action: 'LOGOUT' });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith({
        userId: null,
        action: 'LOGOUT',
        cible: null,
        adresseIp: null,
        resultat: null,
        detailsAvantApres: null,
      });
      expect(mockAuditLogRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('applique filtres (action, userId, période), pagination et tri DESC', async () => {
      mockAuditLogRepository.findAndCount.mockResolvedValue([[{ id: '1' }], 1]);

      const res = await service.list({
        action: 'LOGIN',
        userId: '11111111-1111-4111-8111-111111111111',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        page: 2,
        limit: 10,
      });

      const arg = mockAuditLogRepository.findAndCount.mock.calls[0][0];
      expect(arg.where.action).toBe('LOGIN');
      expect(arg.where.userId).toBe('11111111-1111-4111-8111-111111111111');
      // Période présente -> filtre sur horodatage (opérateur Between).
      expect(arg.where.horodatage).toBeDefined();
      expect(arg.order).toEqual({ horodatage: 'DESC' });
      expect(arg.skip).toBe(10); // (page 2 - 1) * limit 10
      expect(arg.take).toBe(10);
      expect(res).toEqual({ items: [{ id: '1' }], total: 1, page: 2, limit: 10 });
    });

    it('sans filtre : page=1, limit=50, aucun critère where', async () => {
      mockAuditLogRepository.findAndCount.mockResolvedValue([[], 0]);

      const res = await service.list({});

      const arg = mockAuditLogRepository.findAndCount.mock.calls[0][0];
      expect(arg.where).toEqual({});
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(50);
      expect(res).toEqual({ items: [], total: 0, page: 1, limit: 50 });
    });

    it('une seule borne (from) -> filtre horodatage présent', async () => {
      mockAuditLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ from: '2026-01-01T00:00:00.000Z' });

      const arg = mockAuditLogRepository.findAndCount.mock.calls[0][0];
      expect(arg.where.horodatage).toBeDefined();
    });
  });

  describe('export', () => {
    it('mêmes filtres que list, tri DESC, take plafonné, SANS pagination', async () => {
      mockAuditLogRepository.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const rows = await service.export({ action: 'LOGIN', page: 2, limit: 10 });

      const arg = mockAuditLogRepository.find.mock.calls[0][0];
      expect(arg.where.action).toBe('LOGIN');
      expect(arg.order).toEqual({ horodatage: 'DESC' });
      // Export = tout le résultat : pas de skip/take de pagination ; un take
      // de garde-fou (grand) est présent, jamais 10.
      expect(arg.skip).toBeUndefined();
      expect(arg.take).toBeGreaterThan(10);
      expect(rows).toEqual([{ id: '1' }, { id: '2' }]);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AuditService, MESSAGE_PERIODE_INVALIDE, echapperLike } from './audit.service';
import { AuditLog } from '../../database/entities/audit-log.entity';

/**
 * Tests unitaires d'AuditService (US-AUTH-12, complétés par US-AUDIT-01).
 *
 * Le repository AuditLog est remplacé par un faux : je vérifie que record()
 * construit UNE entrée normalisée (acteur -> userId, champs absents -> null) et
 * l'écrit une seule fois, et que list()/export() posent les bons filtres
 * (acteur, cible, résultat, période validée) + pagination + tri DESC. Aucune opération d'update/delete n'est exposée.
 */
describe('AuditService', () => {
  let service: AuditService;
  const mockAuditLogRepository = {
    create: jest.fn((x) => x),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
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
    it('applique filtres (action, userId, période), pagination et tri DESC puis id', async () => {
      const qb = fauxQb([{ ...LIGNE }], 1);
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(qb);

      const res = await service.list({
        action: 'LOGIN',
        userId: '11111111-1111-4111-8111-111111111111',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        page: 2,
        limit: 10,
      });

      expect(qb.leftJoin).toHaveBeenCalledWith('users', 'u', 'u.id = a.user_id');
      expect(qb.andWhere).toHaveBeenCalledWith('a.action = :action', { action: 'LOGIN' });
      expect(qb.andWhere).toHaveBeenCalledWith('a.user_id = :userId', {
        userId: '11111111-1111-4111-8111-111111111111',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.horodatage >= :from', {
        from: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.horodatage <= :to', {
        to: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(qb.orderBy).toHaveBeenCalledWith('a.horodatage', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('a.id', 'DESC');
      expect(qb.offset).toHaveBeenCalledWith(10); // (page 2 - 1) * limit 10
      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(res.total).toBe(1);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(10);
      expect(res.items).toEqual([VUE]);
    });

    it('sans filtre : page=1, limit=50, aucun critère where', async () => {
      const qb = fauxQb([], 0);
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(qb);

      const res = await service.list({});

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.offset).toHaveBeenCalledWith(0);
      expect(qb.limit).toHaveBeenCalledWith(50);
      expect(res).toEqual({ items: [], total: 0, page: 1, limit: 50 });
    });

    it('une seule borne (from) -> seul le filtre >= est posé', async () => {
      const qb = fauxQb([], 0);
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(qb);

      await service.list({ from: '2026-01-01T00:00:00.000Z' });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere.mock.calls[0][0]).toBe('a.horodatage >= :from');
    });

    it('US-AUDIT-01 : acteur (email contient, jokers neutralisés), cible exacte, résultat', async () => {
      const qb = fauxQb([], 0);
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(qb);

      await service.list({ acteur: '  a_b%@esprit ', cible: ' cert-1 ', resultat: 'Échec' });

      expect(qb.andWhere).toHaveBeenCalledWith("u.email ILIKE :acteur ESCAPE '\\'", {
        acteur: '%a\\_b\\%@esprit%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.cible = :cible', { cible: 'cert-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('a.resultat = :resultat', {
        resultat: 'Échec',
      });
    });

    it('US-AUDIT-01 : période inversée (from > to) -> 400, aucune requête', async () => {
      await expect(
        service.list({
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(new BadRequestException(MESSAGE_PERIODE_INVALIDE));
      expect(mockAuditLogRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('US-AUDIT-01 : from = to (instant unique) est accepté', async () => {
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(fauxQb([], 0));
      await expect(
        service.list({
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).resolves.toBeDefined();
    });

    it('acteur absent (compte supprimé / action anonyme) -> acteur null', async () => {
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(
        fauxQb(
          [
            { ...LIGNE, user_id: null, acteur_email: null },
            { ...LIGNE, acteur_email: null },
          ],
          2,
        ),
      );

      const res = await service.list({});

      expect(res.items[0].acteur).toBeNull();
      expect(res.items[1].acteur).toBeNull();
      expect(res.items[1].userId).toBe('admin-1');
    });
  });

  describe('export', () => {
    it('mêmes filtres que list, tri DESC, limite plafonnée, SANS pagination', async () => {
      const qb = fauxQb([{ ...LIGNE }, { ...LIGNE, id: '2' }], 2);
      mockAuditLogRepository.createQueryBuilder.mockReturnValue(qb);

      const rows = await service.export({ action: 'LOGIN', page: 2, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith('a.action = :action', { action: 'LOGIN' });
      expect(qb.orderBy).toHaveBeenCalledWith('a.horodatage', 'DESC');
      // Export = tout le résultat : pas d'offset de pagination ; une limite
      // de garde-fou (grande) est présente, jamais 10.
      expect(qb.offset).not.toHaveBeenCalled();
      expect(qb.limit).toHaveBeenCalledWith(100000);
      expect(rows.map((r) => r.id)).toEqual(['1', '2']);
    });

    it('période inversée -> 400 aussi à l export', async () => {
      await expect(
        service.export({ from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('actions', () => {
    it('liste les actions distinctes, triées', async () => {
      mockAuditLogRepository.query.mockResolvedValue([
        { action: 'LOGIN' },
        { action: 'ROLE_CHANGE' },
      ]);

      await expect(service.actions()).resolves.toEqual(['LOGIN', 'ROLE_CHANGE']);
      expect(mockAuditLogRepository.query).toHaveBeenCalledWith(
        'SELECT DISTINCT action FROM audit_logs ORDER BY action',
      );
    });
  });

  describe('echapperLike', () => {
    it('neutralise %, _ et la barre oblique inverse', () => {
      expect(echapperLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
      expect(echapperLike('admin@esprit.tn')).toBe('admin@esprit.tn');
    });
  });
});

const HORO = new Date('2026-01-15T10:00:00.000Z');

const LIGNE = {
  id: '1',
  user_id: 'admin-1',
  action: 'LOGIN',
  cible: null,
  adresse_ip: '127.0.0.1',
  resultat: 'Succès',
  details_avant_apres: null,
  horodatage: HORO,
  acteur_email: 'admin@esprit.tn',
  acteur_prenom: 'Admin',
  acteur_nom: 'Esprit',
  acteur_role: 'ADMIN',
};

const VUE = {
  id: '1',
  userId: 'admin-1',
  acteur: {
    id: 'admin-1',
    email: 'admin@esprit.tn',
    prenom: 'Admin',
    nom: 'Esprit',
    role: 'ADMIN',
  },
  action: 'LOGIN',
  cible: null,
  adresseIp: '127.0.0.1',
  resultat: 'Succès',
  detailsAvantApres: null,
  horodatage: HORO,
};

/** Faux query builder chaînable (clone() renvoie le même objet). */
function fauxQb(lignes: unknown[], total: number): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'leftJoin',
    'select',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'clone',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getCount = jest.fn().mockResolvedValue(total);
  qb.getRawMany = jest.fn().mockResolvedValue(lignes);
  return qb;
}

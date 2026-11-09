import { ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryFailedError } from 'typeorm';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { ModuleFormation } from '../../../database/entities/module-formation.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { StatutGeneration } from '../../../database/enums/statut-generation.enum';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { FileIaService } from '../file-ia.service';
import {
  MESSAGE_AUCUN_SUPPORT_INDEXE,
  MESSAGE_GENERATION_EN_COURS,
  MESSAGE_SUPPORT_NON_INDEXE,
} from './generation.regles';
import { LancerGenerationDto } from './generations.dto';
import { GenerationsService, MESSAGE_FILE_GENERATION } from './generations.service';

/**
 * GenerationsService (US-IA-02) : base, file, Redis, audit simulés. La vraie
 * base (index unique partiel, CHECK), la vraie file et la concurrence sont
 * éprouvées par l'e2e.
 */
describe('GenerationsService (US-IA-02)', () => {
  let service: GenerationsService;
  const dto: LancerGenerationDto = {
    supportId: 's-1',
    nbQuestions: 10,
    types: ['VRAI_FAUX', 'QCU'],
    niveau: 'INTERMEDIAIRE',
    focusThematique: '  sécurité   JWT ',
  };

  const mockManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    countBy: jest.fn(),
    existsBy: jest.fn(),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    query: jest.fn(),
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockFile = { ajouterGeneration: jest.fn() };
  const mockRedis = { incrementer: jest.fn() };
  const mockAudit = { record: jest.fn() };
  const mockConfig = { getOrThrow: jest.fn().mockReturnValue({ generationsParHeure: 10 }) };

  const generation = (): Partial<GenerationIa> => ({
    id: 'g-1',
    moduleId: 'm-1',
    supportId: 's-1',
    formateurId: 'u-1',
    nbQuestionsDemandees: 10,
    typesQuestions: ['QCU', 'VRAI_FAUX'],
    niveau: 'INTERMEDIAIRE',
    focusThematique: 'sécurité JWT',
    statut: StatutGeneration.EN_COURS,
    nbTentatives: 0,
    support: { titre: 'Cours JWT' } as SupportPedagogique,
    dateLancement: new Date('2026-11-09T10:00:00Z'),
  });

  const parEntite =
    (support: Partial<SupportPedagogique> | null) =>
    async (entite: unknown): Promise<unknown> => {
      if (entite === ModuleFormation) return { id: 'm-1', formationId: 'f-1' };
      if (entite === SupportPedagogique) return support;
      return generation();
    };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FormationsService, useValue: mockFormations },
        { provide: FileIaService, useValue: mockFile },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(GenerationsService);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockManager.findOne.mockImplementation(
      parEntite({ id: 's-1', moduleId: 'm-1', statut: StatutSupport.INDEXE }),
    );
    mockManager.existsBy.mockResolvedValue(false);
    mockManager.query.mockResolvedValue([{ id: 'g-1' }]);
    mockRedis.incrementer.mockResolvedValue({ compte: 1, resteSecondes: 3600 });
    mockFile.ajouterGeneration.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('lancer', () => {
    it('support verrouillé en partage, INSERT EN_COURS, audit, travail en file', async () => {
      const vue = await service.lancer('u-1', 'm-1', dto, { adresseIp: '10.0.0.1' });
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      expect(mockManager.findOne).toHaveBeenCalledWith(SupportPedagogique, {
        where: { id: 's-1' },
        lock: { mode: 'pessimistic_read' },
      });
      expect(mockManager.existsBy).toHaveBeenCalledWith(GenerationIa, {
        formateurId: 'u-1',
        statut: StatutGeneration.EN_COURS,
      });
      expect(mockRedis.incrementer).toHaveBeenCalledWith('limite:ia-generation:u-1', 3600);
      const [sql, params] = mockManager.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("'EN_COURS', now()");
      expect(params).toEqual([
        'm-1',
        's-1',
        'u-1',
        10,
        ['QCU', 'VRAI_FAUX'],
        'INTERMEDIAIRE',
        'sécurité JWT',
      ]);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GENERATION_IA_LANCEE', cible: 'g-1', acteur: 'u-1' }),
      );
      expect(mockFile.ajouterGeneration).toHaveBeenCalledWith('g-1');
      expect(vue).toEqual(
        expect.objectContaining({
          id: 'g-1',
          statut: StatutGeneration.EN_COURS,
          support: { id: 's-1', titre: 'Cours JWT' },
          types: ['QCU', 'VRAI_FAUX'],
        }),
      );
    });

    it('404 module inconnu, avant toute écriture', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.lancer('u-1', 'm-x', dto, { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('409 support non indexé ; message d’invitation si le module n’en a aucun', async () => {
      mockManager.findOne.mockImplementation(
        parEntite({ id: 's-1', moduleId: 'm-1', statut: StatutSupport.EN_INDEXATION }),
      );
      mockManager.countBy.mockResolvedValue(0);
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_AUCUN_SUPPORT_INDEXE),
      );
      expect(mockManager.countBy).toHaveBeenCalledWith(SupportPedagogique, {
        moduleId: 'm-1',
        statut: StatutSupport.INDEXE,
      });
      mockManager.countBy.mockResolvedValue(2);
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_SUPPORT_NON_INDEXE),
      );
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockRedis.incrementer).not.toHaveBeenCalled();
    });

    it('404 support d’un autre module', async () => {
      mockManager.findOne.mockImplementation(
        parEntite({ id: 's-1', moduleId: 'm-2', statut: StatutSupport.INDEXE }),
      );
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 génération déjà en cours (contrôle, puis index unique en base)', async () => {
      mockManager.existsBy.mockResolvedValue(true);
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_GENERATION_EN_COURS),
      );
      expect(mockManager.query).not.toHaveBeenCalled();

      mockManager.existsBy.mockResolvedValue(false);
      mockManager.query.mockRejectedValueOnce(
        new QueryFailedError('Q', [], Object.assign(new Error('pg'), { code: '23505' })),
      );
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_GENERATION_EN_COURS),
      );
      mockManager.query.mockRejectedValueOnce(new Error('panne'));
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow('panne');
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('429 au-delà du plafond horaire ; Redis injoignable : pas de blocage', async () => {
      mockRedis.incrementer.mockResolvedValue({ compte: 11, resteSecondes: 600 });
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).rejects.toThrow(
        HttpException,
      );
      expect(mockManager.query).not.toHaveBeenCalled();

      mockRedis.incrementer.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.lancer('u-1', 'm-1', dto, { adresseIp: null })).resolves.toEqual(
        expect.objectContaining({ id: 'g-1' }),
      );
    });

    it('file injoignable : la génération passe en ÉCHEC avec un motif', async () => {
      mockFile.ajouterGeneration.mockRejectedValue(new Error('Redis'));
      await service.lancer('u-1', 'm-1', dto, { adresseIp: null });
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET statut = 'ECHEC'"),
        ['g-1', MESSAGE_FILE_GENERATION],
      );
    });
  });

  describe('lecture', () => {
    it('liste du module, plus récentes d’abord (404 module inconnu)', async () => {
      mockManager.find.mockResolvedValue([generation()]);
      const liste = await service.listerDuModule('m-1');
      expect(liste).toHaveLength(1);
      expect(mockManager.find).toHaveBeenCalledWith(
        GenerationIa,
        expect.objectContaining({ where: { moduleId: 'm-1' }, take: 50 }),
      );
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.listerDuModule('m-x')).rejects.toThrow(NotFoundException);
    });

    it('fiche (404 inconnue)', async () => {
      await expect(service.vue('g-1')).resolves.toEqual(expect.objectContaining({ id: 'g-1' }));
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.vue('g-x')).rejects.toThrow(NotFoundException);
    });
  });
});

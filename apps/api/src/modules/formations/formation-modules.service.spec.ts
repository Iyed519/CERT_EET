import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Atelier } from '../../database/entities/atelier.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { AuditService } from '../audit/audit.service';
import { UpdateModuleDto } from './dto/update-module.dto';
import { FormationModulesService } from './formation-modules.service';
import { FormationsService } from './formations.service';

/**
 * Tests unitaires de FormationModulesService (US-FORM-01, FORM01-2).
 *
 * J'isole la règle centrale : la numérotation des modules reste continue
 * (ajout en fin, renumérotation à la suppression, réordonnancement complet),
 * et aucune écriture n'a lieu sur une formation inconnue ou archivée.
 */
describe('FormationModulesService', () => {
  let service: FormationModulesService;

  const mockManager = {
    delete: jest.fn().mockResolvedValue(undefined),
    decrement: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    // US-FORM-04 : l'ajout passe par la transaction (verrou de la formation).
    query: jest.fn().mockResolvedValue([]),
    findOne: jest.fn((_entite: unknown, options: unknown): unknown =>
      mockModuleRepo.findOne(options),
    ),
    create: jest.fn((_entite: unknown, donnees: unknown): unknown =>
      mockModuleRepo.create(donnees),
    ),
    save: jest.fn((entite: unknown): unknown => mockModuleRepo.save(entite)),
  };
  const mockModuleRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    manager: {
      transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<void>) =>
        travail(mockManager),
      ),
    },
  };
  const mockQcmRepo = { count: jest.fn() };
  const mockAtelierRepo = { count: jest.fn() };
  const mockRessourceRepo = { count: jest.fn().mockResolvedValue(0) };
  const mockFormationsService = { chargerPourEcriture: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };

  const contexte = { adresseIp: '127.0.0.1' };
  const module = (surcharge: Partial<ModuleFormation> = {}): ModuleFormation =>
    ({
      id: 'mod-2',
      formationId: 'form-1',
      titre: 'API REST',
      ordre: 2,
      description: null,
      ...surcharge,
    }) as ModuleFormation;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FormationModulesService,
        { provide: getRepositoryToken(ModuleFormation), useValue: mockModuleRepo },
        { provide: getRepositoryToken(Qcm), useValue: mockQcmRepo },
        { provide: getRepositoryToken(RessourceModule), useValue: mockRessourceRepo },
        { provide: getRepositoryToken(Atelier), useValue: mockAtelierRepo },
        { provide: FormationsService, useValue: mockFormationsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get<FormationModulesService>(FormationModulesService);

    mockFormationsService.chargerPourEcriture.mockResolvedValue({ id: 'form-1' });
    mockModuleRepo.create.mockImplementation((m) => m);
    mockModuleRepo.save.mockImplementation(async (m) => ({ id: 'mod-nouveau', ...m }));
    mockQcmRepo.count.mockResolvedValue(0);
    mockAtelierRepo.count.mockResolvedValue(0);
  });

  describe('ajouter', () => {
    it('place le premier module à l’ordre 1', async () => {
      mockModuleRepo.findOne.mockResolvedValue(null);

      const vue = await service.ajouter('admin-1', 'form-1', { titre: 'Intro' }, contexte);

      expect(vue).toMatchObject({ titre: 'Intro', ordre: 1, description: null });
    });

    it('place un nouveau module après le dernier', async () => {
      mockModuleRepo.findOne.mockResolvedValue(module({ ordre: 4 }));

      const vue = await service.ajouter('admin-1', 'form-1', { titre: 'Bilan' }, contexte);

      expect(vue.ordre).toBe(5);
      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT 1 FROM formations WHERE id = $1 FOR UPDATE',
        ['form-1'],
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MODULE_CREE', cible: 'form-1' }),
      );
    });

    it('n’écrit rien si la formation est refusée en écriture (404 / 409)', async () => {
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );

      await expect(
        service.ajouter('admin-1', 'form-1', { titre: 'Intro' }, contexte),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockModuleRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('modifier', () => {
    const patch = (valeurs: Record<string, unknown>): UpdateModuleDto => valeurs as UpdateModuleDto;

    beforeEach(() => {
      mockModuleRepo.findOne.mockResolvedValue(module({ description: 'Ancienne' }));
      mockModuleRepo.save.mockImplementation(async (m) => m);
    });

    it('modifie le titre sans toucher à l’ordre', async () => {
      const vue = await service.modifier('admin-1', 'form-1', 'mod-2', patch({ titre: 'API' }), contexte);

      expect(vue).toMatchObject({ titre: 'API', ordre: 2, description: 'Ancienne' });
    });

    it('vide la description avec null', async () => {
      const vue = await service.modifier(
        'admin-1',
        'form-1',
        'mod-2',
        patch({ description: null }),
        contexte,
      );
      expect(vue.description).toBeNull();
    });

    it('rejette (400) un corps vide ou un titre vidé', async () => {
      await expect(
        service.modifier('admin-1', 'form-1', 'mod-2', patch({}), contexte),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.modifier('admin-1', 'form-1', 'mod-2', patch({ titre: null }), contexte),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si le module n’appartient pas à la formation de l’URL', async () => {
      mockModuleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.modifier('admin-1', 'form-1', 'mod-autre', patch({ titre: 'X' }), contexte),
      ).rejects.toBeInstanceOf(NotFoundException);
      // La recherche est bien bornée à la formation de l'URL.
      expect(mockModuleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'mod-autre', formationId: 'form-1' },
      });
    });
  });

  describe('supprimer', () => {
    beforeEach(() => {
      mockModuleRepo.findOne.mockResolvedValue(module({ ordre: 2 }));
    });

    it('supprime puis referme le trou dans la numérotation, en une transaction', async () => {
      await service.supprimer('admin-1', 'form-1', 'mod-2', contexte);

      expect(mockModuleRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.delete).toHaveBeenCalledWith(ModuleFormation, { id: 'mod-2' });
      // Seuls les modules SUIVANTS (ordre > 2) de CETTE formation reculent d'un rang.
      const [, critere, colonne, pas] = mockManager.decrement.mock.calls[0];
      expect(critere.formationId).toBe('form-1');
      expect(colonne).toBe('ordre');
      expect(pas).toBe(1);
    });

    it('refuse (409) de supprimer un module qui porte une évaluation', async () => {
      mockQcmRepo.count.mockResolvedValue(1);

      await expect(
        service.supprimer('admin-1', 'form-1', 'mod-2', contexte),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockManager.delete).not.toHaveBeenCalled();
    });

    it('refuse (409) de supprimer un module qui porte un atelier (US-ATEL-01)', async () => {
      mockAtelierRepo.count.mockResolvedValue(1);

      await expect(
        service.supprimer('admin-1', 'form-1', 'mod-2', contexte),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockAtelierRepo.count).toHaveBeenCalledWith({ where: { moduleId: 'mod-2' } });
      expect(mockManager.delete).not.toHaveBeenCalled();
    });

    it('US-FORM-04 : refuse (409) de supprimer un module qui porte des ressources', async () => {
      mockModuleRepo.findOne.mockResolvedValue(module());
      mockQcmRepo.count.mockResolvedValue(0);
      mockAtelierRepo.count.mockResolvedValue(0);
      mockRessourceRepo.count.mockResolvedValueOnce(2);
      await expect(service.supprimer('form-1-admin', 'form-1', 'mod-2', contexte)).rejects.toThrow(
        new ConflictException(
          'Ce module contient des ressources : retirez-les avant de le supprimer.',
        ),
      );
      expect(mockModuleRepo.manager.transaction).not.toHaveBeenCalled();
    });
  });

  describe('reordonner', () => {
    const modules = [
      module({ id: 'a', ordre: 1 }),
      module({ id: 'b', ordre: 2 }),
      module({ id: 'c', ordre: 3 }),
    ];

    beforeEach(() => {
      mockModuleRepo.find.mockResolvedValue(modules);
    });

    it('applique l’ordre du tableau (1, 2, 3…) et renvoie la liste réordonnée', async () => {
      const vues = await service.reordonner('admin-1', 'form-1', ['c', 'a', 'b'], contexte);

      expect(vues.map((v) => [v.id, v.ordre])).toEqual([
        ['c', 1],
        ['a', 2],
        ['b', 3],
      ]);
      expect(mockManager.update).toHaveBeenCalledTimes(3);
      expect(mockManager.update).toHaveBeenCalledWith(ModuleFormation, { id: 'c' }, { ordre: 1 });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MODULES_REORDONNES',
          detailsAvantApres: { avant: ['a', 'b', 'c'], apres: ['c', 'a', 'b'] },
        }),
      );
    });

    it.each([
      ['un module oublié', ['a', 'b']],
      ['un module étranger', ['a', 'b', 'x']],
      ['un module en trop', ['a', 'b', 'c', 'x']],
    ])('rejette (400) %s, sans rien écrire', async (_cas, ids) => {
      await expect(service.reordonner('admin-1', 'form-1', ids, contexte)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });
});

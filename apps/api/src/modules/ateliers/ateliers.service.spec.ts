import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Grille } from '../../database/entities/grille.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { AteliersService } from './ateliers.service';
import { CreateAtelierDto } from './dto/create-atelier.dto';

/**
 * AteliersService (US-ATEL-01) avec des dépôts simulés. L'horloge de
 * PostgreSQL est simulée par `SELECT now()` : dates FIXES.
 */
describe('AteliersService (US-ATEL-01)', () => {
  let service: AteliersService;

  const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');
  const FUTUR = '2026-12-15T23:59:00.000Z';
  const contexte = { adresseIp: '127.0.0.1' };

  const atelier = (surcharge: Partial<Atelier> = {}): Atelier =>
    ({
      id: 'at-1',
      moduleId: 'mod-1',
      formateurId: 'form-1',
      titre: 'Atelier API',
      enonce: 'Implémentez une API REST.',
      competencesVisees: null,
      dateLimite: new Date(FUTUR),
      typesLivrables: ['pdf'],
      tailleMaxMo: 20,
      nbMaxFichiers: 1,
      toleranceRetardHeures: 0,
      statut: StatutAtelier.BROUILLON,
      createdAt: MAINTENANT,
      updatedAt: MAINTENANT,
      module: { id: 'mod-1', formationId: 'formation-1', titre: 'Module 1' },
      ...surcharge,
    }) as Atelier;

  const mockManager = {
    query: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countBy: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockAtelierRepo = {
    create: jest.fn((a) => a),
    save: jest.fn(async (a) => ({ ...atelier(), ...a, id: 'at-1' })),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockModuleRepo = { findOne: jest.fn() };
  const mockFormationsService = { chargerPourEcriture: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };

  const dtoValide = (surcharge: Partial<CreateAtelierDto> = {}): CreateAtelierDto => ({
    titre: '  Atelier API  ',
    enonce: 'Implémentez une API REST sécurisée.',
    dateLimite: FUTUR,
    typesLivrables: ['zip', 'pdf'],
    ...surcharge,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AteliersService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(Atelier), useValue: mockAtelierRepo },
        { provide: getRepositoryToken(ModuleFormation), useValue: mockModuleRepo },
        { provide: FormationsService, useValue: mockFormationsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get(AteliersService);

    mockManager.query.mockResolvedValue([{ maintenant: MAINTENANT }]);
    mockModuleRepo.findOne.mockResolvedValue({ id: 'mod-1', formationId: 'formation-1' });
    mockFormationsService.chargerPourEcriture.mockResolvedValue({ id: 'formation-1' });
    mockAtelierRepo.findOne.mockResolvedValue(atelier());
    mockManager.findOne.mockResolvedValue(atelier());
    mockManager.findOneOrFail.mockResolvedValue({
      id: 'mod-1',
      formationId: 'formation-1',
      titre: 'Module 1',
    });
  });

  describe('creer', () => {
    it('crée en BROUILLON avec les valeurs par défaut, normalise et trace ATELIER_CREE', async () => {
      await service.creer('form-1', 'mod-1', dtoValide(), contexte);

      expect(mockAtelierRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'mod-1',
          formateurId: 'form-1',
          titre: 'Atelier API',
          typesLivrables: ['pdf', 'zip'],
          tailleMaxMo: 20,
          nbMaxFichiers: 1,
          toleranceRetardHeures: 0,
          competencesVisees: null,
          statut: StatutAtelier.BROUILLON,
        }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATELIER_CREE',
          cible: 'at-1',
          detailsAvantApres: expect.objectContaining({
            formationId: 'formation-1',
            moduleId: 'mod-1',
          }),
        }),
      );
    });

    it('refuse (400) une date limite passée selon l’horloge de PostgreSQL, sans rien écrire', async () => {
      await expect(
        service.creer(
          'form-1',
          'mod-1',
          dtoValide({ dateLimite: '2026-11-08T09:59:59.000Z' }),
          contexte,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockManager.query).toHaveBeenCalledWith('SELECT now() AS maintenant');
      expect(mockAtelierRepo.save).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('refuse (400) un titre trop court une fois rogné', async () => {
      await expect(
        service.creer('form-1', 'mod-1', dtoValide({ titre: '  ab   ' }), contexte),
      ).rejects.toThrow('Le titre doit contenir au moins 3 caractères.');
      expect(mockAtelierRepo.save).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour un module inconnu', async () => {
      mockModuleRepo.findOne.mockResolvedValue(null);
      await expect(service.creer('form-1', 'mod-x', dtoValide(), contexte)).rejects.toThrow(
        new NotFoundException('Module introuvable.'),
      );
    });

    it('propage le 409 d’une formation archivée', async () => {
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );
      await expect(service.creer('form-1', 'mod-1', dtoValide(), contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockAtelierRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('renvoie une vue en liste blanche, avec formation et module', async () => {
      const vue = await service.detail('at-1');
      expect(vue).toEqual(
        expect.objectContaining({ formationId: 'formation-1', moduleTitre: 'Module 1' }),
      );
      expect(vue).not.toHaveProperty('module');
      expect(vue).not.toHaveProperty('formateurId');
    });

    it('renvoie 404 pour un atelier inconnu', async () => {
      mockAtelierRepo.findOne.mockResolvedValue(null);
      await expect(service.detail('at-x')).rejects.toThrow(
        new NotFoundException('Atelier introuvable.'),
      );
    });
  });

  describe('modifier', () => {
    it('verrouille la ligne, écrit seulement ce qui change et trace avant/après', async () => {
      await service.modifier(
        'form-1',
        'at-1',
        { titre: 'Atelier API', tailleMaxMo: 50, typesLivrables: ['pdf'] },
        contexte,
      );

      expect(mockManager.findOne).toHaveBeenCalledWith(
        Atelier,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.update).toHaveBeenCalledWith(Atelier, { id: 'at-1' }, { tailleMaxMo: 50 });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATELIER_MODIFIE',
          detailsAvantApres: { avant: { tailleMaxMo: 20 }, apres: { tailleMaxMo: 50 } },
        }),
      );
    });

    it('n’écrit ni ne trace rien quand rien ne change', async () => {
      await service.modifier('form-1', 'at-1', { dateLimite: FUTUR }, contexte);
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('refuse (400) un corps vide', async () => {
      await expect(service.modifier('form-1', 'at-1', {}, contexte)).rejects.toThrow(
        new BadRequestException('Aucune modification fournie.'),
      );
    });

    it('refuse (400) une nouvelle date limite passée', async () => {
      await expect(
        service.modifier('form-1', 'at-1', { dateLimite: '2026-01-01T00:00:00.000Z' }, contexte),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('refuse (400) de vider un champ obligatoire', async () => {
      await expect(
        service.modifier('form-1', 'at-1', { titre: null } as never, contexte),
      ).rejects.toThrow('Le champ titre est obligatoire et ne peut pas être vidé.');
    });

    it('efface les compétences visées avec null', async () => {
      mockManager.findOne.mockResolvedValue(atelier({ competencesVisees: 'JWT' }));
      await service.modifier('form-1', 'at-1', { competencesVisees: null }, contexte);
      expect(mockManager.update).toHaveBeenCalledWith(
        Atelier,
        { id: 'at-1' },
        { competencesVisees: null },
      );
    });

    it('refuse (409) un atelier qui n’est plus en brouillon, avant même de lire le corps', async () => {
      mockManager.findOne.mockResolvedValue(atelier({ statut: StatutAtelier.PUBLIE }));
      await expect(service.modifier('form-1', 'at-1', {}, contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('renvoie 404 pour un atelier inconnu', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(
        service.modifier('form-1', 'at-x', { titre: 'Nouveau' }, contexte),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('supprimer', () => {
    it('supprime un brouillon et trace ATELIER_SUPPRIME', async () => {
      await service.supprimer('form-1', 'at-1', contexte);
      expect(mockManager.delete).toHaveBeenCalledWith(Atelier, { id: 'at-1' });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATELIER_SUPPRIME',
          detailsAvantApres: {
            formationId: 'formation-1',
            moduleId: 'mod-1',
            titre: 'Atelier API',
          },
        }),
      );
    });

    it('refuse (409) un atelier publié, sans rien supprimer ni tracer', async () => {
      mockManager.findOne.mockResolvedValue(atelier({ statut: StatutAtelier.PUBLIE }));
      await expect(service.supprimer('form-1', 'at-1', contexte)).rejects.toThrow(
        new ConflictException('Seul un atelier en brouillon peut être supprimé.'),
      );
      expect(mockManager.delete).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('publier (US-ATEL-03)', () => {
    /** Le gestionnaire répond selon l'entité : l'atelier verrouillé, puis sa grille. */
    const preparer = (a: Atelier, grille: Partial<Grille> | null): void => {
      mockManager.findOne.mockImplementation(async (entite: unknown) =>
        entite === Grille ? grille : a,
      );
      mockManager.countBy.mockResolvedValue(4);
    };

    it('publie sous le verrou de l’atelier, à l’heure de PostgreSQL, et trace ATELIER_PUBLIE', async () => {
      preparer(atelier(), { id: 'gr-1', validee: true });

      await service.publier('form-1', 'at-1', contexte);

      expect(mockManager.findOne).toHaveBeenCalledWith(
        Atelier,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.query).toHaveBeenCalledWith('SELECT now() AS maintenant');
      expect(mockManager.update).toHaveBeenCalledWith(
        Atelier,
        { id: 'at-1' },
        { statut: StatutAtelier.PUBLIE },
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATELIER_PUBLIE',
          acteur: 'form-1',
          cible: 'at-1',
          detailsAvantApres: expect.objectContaining({
            statut: { avant: StatutAtelier.BROUILLON, apres: StatutAtelier.PUBLIE },
            formationId: 'formation-1',
            grilleId: 'gr-1',
            nbCriteres: 4,
          }),
        }),
      );
    });

    it('409 sans grille, ou avec une grille non validée — rien n’est écrit ni tracé', async () => {
      for (const grille of [null, { id: 'gr-1', validee: false }]) {
        preparer(atelier(), grille);
        await expect(service.publier('form-1', 'at-1', contexte)).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('409 pour un atelier déjà publié', async () => {
      preparer(atelier({ statut: StatutAtelier.PUBLIE }), { id: 'gr-1', validee: true });
      await expect(service.publier('form-1', 'at-1', contexte)).rejects.toThrow(
        'Cet atelier est déjà publié.',
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('400 si la date limite est passée selon PostgreSQL (même si l’horloge Node dit le contraire)', async () => {
      preparer(atelier({ dateLimite: new Date('2026-11-08T09:59:59.999Z') }), {
        id: 'gr-1',
        validee: true,
      });
      await expect(service.publier('form-1', 'at-1', contexte)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('404 pour un atelier inconnu ; 409 si la formation est archivée', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.publier('form-1', 'inconnu', contexte)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      preparer(atelier(), { id: 'gr-1', validee: true });
      mockFormationsService.chargerPourEcriture.mockRejectedValueOnce(
        new ConflictException('Formation archivée.'),
      );
      await expect(service.publier('form-1', 'at-1', contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });
});

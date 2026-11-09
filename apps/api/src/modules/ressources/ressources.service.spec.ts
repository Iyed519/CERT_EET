import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { NatureRessource } from '../../database/enums/nature-ressource.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { MESSAGE_ORDRE_INVALIDE, MESSAGE_TROP_DE_RESSOURCES } from './ressource.regles';
import { RessourcesService } from './ressources.service';

/**
 * RessourcesService (US-FORM-05) : base, formations et audit simulés. La vraie
 * base (CHECK, UNIQUE) et la concurrence sont éprouvées par l'e2e.
 */
describe('RessourcesService (US-FORM-05)', () => {
  let service: RessourcesService;
  const ctx = { adresseIp: '10.0.0.1' };

  const mockManager = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockAudit = { record: jest.fn() };

  const ressource = (): Partial<RessourceModule> => ({
    id: 'r-1',
    moduleId: 'm-1',
    ordre: 1,
    nature: NatureRessource.LIEN,
    titre: 'Vidéo',
    description: null,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    plateforme: 'YOUTUBE',
    videoId: 'dQw4w9WgXcQ',
    debutSecondes: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RessourcesService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FormationsService, useValue: mockFormations },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(RessourcesService);
    mockManager.findOne.mockImplementation(async (entite: unknown) =>
      entite === ModuleFormation ? { id: 'm-1', formationId: 'f-1' } : ressource(),
    );
    mockManager.findOneOrFail.mockResolvedValue({ id: 'm-1', formationId: 'f-1' });
    mockAudit.record.mockResolvedValue(undefined);
  });

  describe('ajouterLien', () => {
    it('verrouille le module, place le lien en dernier, trace', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ nb: 2, max: 7 }])
        .mockResolvedValueOnce([{ id: 'r-1' }]);
      const vue = await service.ajouterLien(
        'u-1',
        'm-1',
        { titre: '  Vidéo   JWT ', url: 'https://youtu.be/dQw4w9WgXcQ?t=30', description: ' ' },
        ctx,
      );
      expect(mockManager.findOne).toHaveBeenCalledWith(
        ModuleFormation,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      expect(mockManager.query.mock.calls[1][1]).toEqual([
        'm-1',
        8,
        'Vidéo JWT',
        null,
        'https://youtu.be/dQw4w9WgXcQ?t=30',
        'YOUTUBE',
        'dQw4w9WgXcQ',
        30,
        'u-1',
      ]);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESSOURCE_AJOUTEE', cible: 'r-1', acteur: 'u-1' }),
      );
      expect(vue).toEqual(expect.objectContaining({ id: 'r-1', domaine: 'youtube.com' }));
    });

    it('400 adresse invalide, titre vide : rien n’est verrouillé ni écrit', async () => {
      await expect(
        service.ajouterLien('u-1', 'm-1', { titre: 'x', url: 'javascript:alert(1)' }, ctx),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.ajouterLien('u-1', 'm-1', { titre: '   ', url: 'https://exemple.tn' }, ctx),
      ).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('409 au-delà de 50 ressources ; 404 module inconnu', async () => {
      mockManager.query.mockResolvedValueOnce([{ nb: 50, max: 50 }]);
      await expect(
        service.ajouterLien('u-1', 'm-1', { titre: 'x', url: 'https://exemple.tn' }, ctx),
      ).rejects.toThrow(new ConflictException(MESSAGE_TROP_DE_RESSOURCES));
      mockManager.findOne.mockResolvedValue(null);
      await expect(
        service.ajouterLien('u-1', 'm-x', { titre: 'x', url: 'https://exemple.tn' }, ctx),
      ).rejects.toThrow(NotFoundException);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('modifier', () => {
    it('sous verrou de la ressource, champs fournis seulement, vidéo réanalysée', async () => {
      await service.modifier(
        'u-1',
        'r-1',
        { url: 'https://vimeo.com/76979871', description: '' },
        ctx,
      );
      expect(mockManager.findOne).toHaveBeenCalledWith(RessourceModule, {
        where: { id: 'r-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        RessourceModule,
        { id: 'r-1' },
        {
          description: null,
          url: 'https://vimeo.com/76979871',
          plateforme: 'VIMEO',
          videoId: '76979871',
          debutSecondes: null,
        },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESSOURCE_MODIFIEE' }),
      );
    });

    it('400 sans champ ou titre vide ; 404 inconnue', async () => {
      await expect(service.modifier('u-1', 'r-1', {}, ctx)).rejects.toThrow(BadRequestException);
      await expect(service.modifier('u-1', 'r-1', { titre: '  ' }, ctx)).rejects.toThrow(
        BadRequestException,
      );
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.modifier('u-1', 'r-x', { titre: 'x' }, ctx)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });

  describe('reordonner', () => {
    it('sous verrou du module, en deux passes, puis trace', async () => {
      mockManager.query.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
      mockManager.find.mockResolvedValue([]);
      await service.reordonner('u-1', 'm-1', { ids: ['b', 'a'] }, ctx);
      const requetes = mockManager.query.mock.calls.map((c) => c[0] as string);
      expect(requetes[1]).toContain('ordre = ordre + 1000');
      expect(requetes[2]).toContain('WITH ORDINALITY');
      expect(mockManager.query.mock.calls[2][1]).toEqual(['m-1', ['b', 'a']]);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESSOURCES_REORDONNEES', cible: 'm-1' }),
      );
    });

    it('400 si la liste ne correspond pas aux ressources du module', async () => {
      mockManager.query.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
      await expect(service.reordonner('u-1', 'm-1', { ids: ['a'] }, ctx)).rejects.toThrow(
        new BadRequestException(MESSAGE_ORDRE_INVALIDE),
      );
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('supprimer', () => {
    it('verrouille le module de la ressource, supprime, trace', async () => {
      await service.supprimer('u-1', 'r-1', ctx);
      expect(mockManager.findOne).toHaveBeenCalledWith(
        ModuleFormation,
        expect.objectContaining({ where: { id: 'm-1' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.delete).toHaveBeenCalledWith(RessourceModule, { id: 'r-1' });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESSOURCE_SUPPRIMEE', cible: 'r-1' }),
      );
    });

    it('404 inconnue (avant ou après le verrou)', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.supprimer('u-1', 'r-x', ctx)).rejects.toThrow(NotFoundException);
      mockManager.findOne
        .mockResolvedValueOnce(ressource())
        .mockResolvedValueOnce({ id: 'm-1', formationId: 'f-1' })
        .mockResolvedValueOnce(null);
      await expect(service.supprimer('u-1', 'r-1', ctx)).rejects.toThrow(NotFoundException);
      expect(mockManager.delete).not.toHaveBeenCalled();
    });
  });

  it('liste du module dans l’ordre (404 module inconnu)', async () => {
    mockManager.find.mockResolvedValue([ressource()]);
    expect(await service.listerDuModule('m-1')).toHaveLength(1);
    expect(mockManager.find).toHaveBeenCalledWith(RessourceModule, {
      where: { moduleId: 'm-1' },
      order: { ordre: 'ASC' },
    });
    mockManager.findOne.mockResolvedValue(null);
    await expect(service.listerDuModule('m-x')).rejects.toThrow(NotFoundException);
  });
});

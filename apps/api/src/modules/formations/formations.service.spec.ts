import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { AuditService } from '../audit/audit.service';
import { CreateFormationDto } from './dto/create-formation.dto';
import { FormationsService } from './formations.service';

/**
 * Tests unitaires de FormationsService (US-FORM-01).
 *
 * Repository et AuditService remplacés par des faux : j'isole la logique
 * métier (statut forcé à OUVERTE, cohérence des dates, audit, règle de
 * visibilité admin / catalogue).
 */
describe('FormationsService', () => {
  let service: FormationsService;

  const mockFormationRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };
  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const admin = { role: Role.ADMINISTRATEUR };
  const apprenant = { role: Role.APPRENANT };
  const formateur = { role: Role.FORMATEUR };
  const contexte = { adresseIp: '127.0.0.1' };

  const dto = (surcharge: Partial<CreateFormationDto> = {}): CreateFormationDto =>
    ({
      titre: 'Full-Stack JS',
      capaciteMax: 25,
      noteMinCertification: 60,
      ...surcharge,
    }) as CreateFormationDto;

  const formation = (surcharge: Partial<Formation> = {}): Formation =>
    ({
      id: 'form-1',
      titre: 'Full-Stack JS',
      description: null,
      objectifs: null,
      prerequis: null,
      dateDebut: null,
      dateFin: null,
      dureeHeures: null,
      capaciteMax: 25,
      statut: StatutFormation.OUVERTE,
      noteMinCertification: 60,
      modeleCertificat: null,
      modules: [],
      createdAt: new Date('2026-10-06T10:00:00Z'),
      updatedAt: new Date('2026-10-06T10:00:00Z'),
      ...surcharge,
    }) as Formation;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FormationsService,
        { provide: getRepositoryToken(Formation), useValue: mockFormationRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get<FormationsService>(FormationsService);

    mockFormationRepo.create.mockImplementation((f) => f);
    mockFormationRepo.save.mockImplementation(async (f) => ({ ...formation(), ...f }));
  });

  describe('creer', () => {
    it('crée la formation au statut OUVERTE et normalise les champs absents à null', async () => {
      const vue = await service.creer('admin-1', dto(), contexte);

      expect(vue.statut).toBe(StatutFormation.OUVERTE);
      expect(mockFormationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          titre: 'Full-Stack JS',
          capaciteMax: 25,
          noteMinCertification: 60,
          statut: StatutFormation.OUVERTE,
          description: null,
          dateDebut: null,
        }),
      );
    });

    it('journalise FORMATION_CREEE avec l’admin en acteur et la formation en cible', async () => {
      await service.creer('admin-1', dto(), contexte);

      expect(mockAuditService.record).toHaveBeenCalledTimes(1);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORMATION_CREEE',
          acteur: 'admin-1',
          cible: 'form-1',
          adresseIp: '127.0.0.1',
          resultat: 'Succès',
        }),
      );
    });

    it('accepte une date de fin égale à la date de début', async () => {
      await expect(
        service.creer('admin-1', dto({ dateDebut: '2026-11-02', dateFin: '2026-11-02' }), contexte),
      ).resolves.toBeDefined();
    });

    it('rejette (400) une date de fin antérieure au début, sans rien écrire', async () => {
      await expect(
        service.creer('admin-1', dto({ dateDebut: '2026-12-18', dateFin: '2026-11-02' }), contexte),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockFormationRepo.save).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('lister', () => {
    beforeEach(() => {
      mockFormationRepo.findAndCount.mockResolvedValue([[formation()], 1]);
    });

    it('admin : aucun filtre de statut par défaut, pagination appliquée', async () => {
      const page = await service.lister(admin, { page: 2, limit: 10 });

      expect(page).toMatchObject({ total: 1, page: 2, limit: 10 });
      expect(mockFormationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 10, take: 10 }),
      );
    });

    it('admin : filtre libre sur le statut', async () => {
      await service.lister(admin, { statut: StatutFormation.ARCHIVEE });

      expect(mockFormationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { statut: StatutFormation.ARCHIVEE } }),
      );
    });

    it.each([apprenant, formateur])(
      'non-admin ($role) : toujours limité au catalogue OUVERTE',
      async (lecteur) => {
        await service.lister(lecteur, {});

        expect(mockFormationRepo.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({ where: { statut: StatutFormation.OUVERTE } }),
        );
      },
    );

    it('non-admin : refuse (403) un filtre sur un statut non ouvert', async () => {
      await expect(
        service.lister(apprenant, { statut: StatutFormation.FERMEE }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockFormationRepo.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('consulter', () => {
    it('renvoie la formation et ses modules', async () => {
      const modules = [
        { id: 'mod-1', titre: 'Intro', ordre: 1, description: null },
        { id: 'mod-2', titre: 'API', ordre: 2, description: 'REST' },
      ] as ModuleFormation[];
      mockFormationRepo.findOne.mockResolvedValue(formation({ modules }));

      const detail = await service.consulter(apprenant, 'form-1');

      expect(detail.modules).toEqual([
        { id: 'mod-1', titre: 'Intro', ordre: 1, description: null },
        { id: 'mod-2', titre: 'API', ordre: 2, description: 'REST' },
      ]);
      // Le tri des modules est demandé à la base, pas refait en mémoire.
      expect(mockFormationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ order: { modules: { ordre: 'ASC' } } }),
      );
    });

    it('404 si la formation n’existe pas', async () => {
      mockFormationRepo.findOne.mockResolvedValue(null);

      await expect(service.consulter(admin, 'inconnue')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('non-admin : 404 sur une formation fermée (existence non révélée)', async () => {
      mockFormationRepo.findOne.mockResolvedValue(
        formation({ statut: StatutFormation.FERMEE }),
      );

      await expect(service.consulter(apprenant, 'form-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('admin : voit une formation fermée', async () => {
      mockFormationRepo.findOne.mockResolvedValue(
        formation({ statut: StatutFormation.FERMEE }),
      );

      const detail = await service.consulter(admin, 'form-1');
      expect(detail.statut).toBe(StatutFormation.FERMEE);
    });
  });
});

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { FormateurFormationsService } from './formateur-formations.service';

/**
 * Tests unitaires de FormateurFormationsService (US-AUTH-16) : la liste ne lit
 * que les affectations du formateur demandé, tous statuts confondus ; le
 * détail renvoie les modules triés.
 */
describe('FormateurFormationsService', () => {
  let service: FormateurFormationsService;

  const mockAffectationRepo = { find: jest.fn() };
  const mockFormationRepo = { findOne: jest.fn() };

  const formation = (surcharge: Partial<Formation> = {}): Formation =>
    ({
      id: 'form-1',
      titre: 'DevOps',
      description: null,
      objectifs: null,
      prerequis: null,
      dateDebut: null,
      dateFin: null,
      dureeHeures: null,
      capaciteMax: 20,
      statut: StatutFormation.OUVERTE,
      noteMinCertification: 60,
      modeleCertificat: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      ...surcharge,
    }) as Formation;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FormateurFormationsService,
        { provide: getRepositoryToken(AffectationFormateur), useValue: mockAffectationRepo },
        { provide: getRepositoryToken(Formation), useValue: mockFormationRepo },
      ],
    }).compile();
    service = moduleRef.get<FormateurFormationsService>(FormateurFormationsService);
  });

  describe('mesFormations', () => {
    it('ne lit que les affectations du formateur, la plus récente d’abord', async () => {
      mockAffectationRepo.find.mockResolvedValue([]);

      await service.mesFormations('user-1');

      expect(mockAffectationRepo.find).toHaveBeenCalledWith({
        where: { formateurId: 'user-1' },
        relations: { formation: true },
        order: { createdAt: 'DESC' },
      });
    });

    it('renvoie toutes ses formations, fermées et archivées comprises, avec la date d’affectation', async () => {
      const le = new Date('2026-10-07T10:00:00.000Z');
      mockAffectationRepo.find.mockResolvedValue([
        { createdAt: le, formation: formation({ id: 'f-ouverte' }) },
        {
          createdAt: le,
          formation: formation({ id: 'f-fermee', statut: StatutFormation.FERMEE }),
        },
        {
          createdAt: le,
          formation: formation({ id: 'f-archivee', statut: StatutFormation.ARCHIVEE }),
        },
      ]);

      const vues = await service.mesFormations('user-1');

      expect(vues.map((v) => [v.id, v.statut])).toEqual([
        ['f-ouverte', StatutFormation.OUVERTE],
        ['f-fermee', StatutFormation.FERMEE],
        ['f-archivee', StatutFormation.ARCHIVEE],
      ]);
      expect(vues[0].affecteLe).toBe(le);
    });
  });

  describe('detail', () => {
    it('renvoie la formation, quel que soit son statut, avec ses modules', async () => {
      mockFormationRepo.findOne.mockResolvedValue({
        ...formation({ statut: StatutFormation.FERMEE }),
        modules: [{ id: 'm-1', titre: 'Intro', ordre: 1, description: null }],
      });

      const vue = await service.detail('form-1');

      expect(mockFormationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ order: { modules: { ordre: 'ASC' } } }),
      );
      expect(vue.statut).toBe(StatutFormation.FERMEE);
      expect(vue.modules).toEqual([{ id: 'm-1', titre: 'Intro', ordre: 1, description: null }]);
    });

    it('lève 404 si la formation a disparu', async () => {
      mockFormationRepo.findOne.mockResolvedValue(null);

      await expect(service.detail('form-x')).rejects.toThrow(NotFoundException);
    });
  });
});

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { ConfigurationDto } from './dto/configuration.dto';
import { QcmConfigurationService } from './qcm-configuration.service';

/**
 * Tests unitaires de QcmConfigurationService (US-QCM-03).
 *
 * Règles croisées (fenêtre, durée, tirage), prérequis (au moins une
 * question), passage BROUILLON -> NON_PUBLIE (jamais de rétrogradation d'un
 * QCM publié), et règle du QCM déjà tenté : seule la fermeture peut être
 * repoussée.
 */
describe('QcmConfigurationService', () => {
  let service: QcmConfigurationService;

  const mockQcmRepo = { findOne: jest.fn(), update: jest.fn() };
  const mockConfigRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    merge: jest.fn(),
  };
  const mockLienRepo = { countBy: jest.fn() };
  const mockTentativeRepo = { countBy: jest.fn() };
  const mockFormationsService = { chargerPourEcriture: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };

  const contexte = { adresseIp: '127.0.0.1' };
  const MAINTENANT = new Date('2026-10-11T12:00:00Z');

  const dto = (surcharge: Partial<ConfigurationDto> = {}): ConfigurationDto => ({
    randomiserQuestions: true,
    randomiserOptions: true,
    nbQuestionsTirees: null,
    dureeMaxMinutes: 30,
    dateOuverture: '2026-11-02T08:00:00.000Z',
    dateFermeture: '2026-11-02T18:00:00.000Z',
    nbTentativesMax: 2,
    delaiEntreTentatives: 24,
    blocageSessionsMultiples: false,
    affichageResultats: AffichageResultats.DIFFERE,
    scoreMinValidation: 60,
    ponderationFormation: 30,
    proctoringWebcam: false,
    desactiverCopierColler: false,
    ...surcharge,
  });

  /** Configuration en base correspondant exactement à dto(). */
  const enBase = (): ConfigurationAntiFraude =>
    ({
      ...service.valider(dto(), 5, MAINTENANT),
      id: 'conf-1',
      qcmId: 'qcm-1',
      updatedAt: new Date(),
    }) as unknown as ConfigurationAntiFraude;

  // Horloge figée à MAINTENANT : `configurer` valide avec l'heure réelle, et
  // les dates de ce fichier sont fixes (sinon la suite échoue une fois ces
  // dates passées — c'est arrivé le 06/11/2026). Seul Date est simulé.
  beforeAll(() => {
    jest.useFakeTimers({
      now: MAINTENANT,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        QcmConfigurationService,
        { provide: getRepositoryToken(Qcm), useValue: mockQcmRepo },
        { provide: getRepositoryToken(ConfigurationAntiFraude), useValue: mockConfigRepo },
        { provide: getRepositoryToken(QcmQuestion), useValue: mockLienRepo },
        { provide: getRepositoryToken(TentativeQcm), useValue: mockTentativeRepo },
        { provide: FormationsService, useValue: mockFormationsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get(QcmConfigurationService);

    mockQcmRepo.findOne.mockResolvedValue({
      id: 'qcm-1',
      statut: StatutQcm.BROUILLON,
      module: { formationId: 'form-1' },
    });
    mockFormationsService.chargerPourEcriture.mockResolvedValue({});
    mockLienRepo.countBy.mockResolvedValue(5);
    mockTentativeRepo.countBy.mockResolvedValue(0);
    mockConfigRepo.findOne.mockResolvedValue(null);
    mockConfigRepo.create.mockImplementation((v) => v);
    mockConfigRepo.merge.mockImplementation((a, b) => ({ ...a, ...b }));
    mockConfigRepo.save.mockImplementation(async (v) => ({ updatedAt: new Date(), ...v }));
  });

  describe('valider (règles croisées)', () => {
    it('accepte une configuration cohérente et normalise le tirage absent à null', () => {
      const { nbQuestionsTirees: _absent, ...sansTirage } = dto();
      void _absent;
      const v = service.valider(sansTirage as ConfigurationDto, 5, MAINTENANT);
      expect(v.nbQuestionsTirees).toBeNull();
      expect(v.dateOuverture).toEqual(new Date('2026-11-02T08:00:00.000Z'));
    });

    it.each([
      [
        'ouverture après fermeture',
        { dateOuverture: '2026-11-03T08:00:00Z' },
        'La date d’ouverture doit précéder la date de fermeture.',
      ],
      [
        'ouverture égale à la fermeture',
        { dateOuverture: '2026-11-02T18:00:00.000Z' },
        'La date d’ouverture doit précéder la date de fermeture.',
      ],
      [
        'fermeture passée',
        { dateOuverture: '2026-10-01T08:00:00Z', dateFermeture: '2026-10-10T08:00:00Z' },
        'La date de fermeture doit être dans le futur.',
      ],
      [
        'fenêtre plus courte que la durée',
        { dateFermeture: '2026-11-02T08:20:00.000Z' },
        /plus courte que la durée d’une tentative \(30 min\)/,
      ],
      [
        'tirage supérieur au nombre de questions',
        { nbQuestionsTirees: 6 },
        'Impossible de tirer 6 questions : le QCM n’en contient que 5.',
      ],
    ])('400 : %s', (_cas, surcharge, message) => {
      expect(() => service.valider(dto(surcharge), 5, MAINTENANT)).toThrow(message);
      expect(() => service.valider(dto(surcharge), 5, MAINTENANT)).toThrow(BadRequestException);
    });

    it('accepte une fenêtre exactement égale à la durée', () => {
      expect(() =>
        service.valider(dto({ dateFermeture: '2026-11-02T08:30:00.000Z' }), 5, MAINTENANT),
      ).not.toThrow();
    });
  });

  describe('configurer', () => {
    it('crée la configuration, passe le QCM en NON_PUBLIE et journalise QCM_CONFIGURE', async () => {
      const vue = await service.configurer('u-1', 'qcm-1', dto(), contexte);

      expect(vue).toMatchObject({ dureeMaxMinutes: 30, nbTentativesMax: 2 });
      expect(mockConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ qcmId: 'qcm-1' }),
      );
      expect(mockQcmRepo.update).toHaveBeenCalledWith(
        { id: 'qcm-1' },
        { statut: StatutQcm.NON_PUBLIE },
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QCM_CONFIGURE',
          acteur: 'u-1',
          cible: 'qcm-1',
          detailsAvantApres: expect.objectContaining({
            avant: null,
            statut: { avant: StatutQcm.BROUILLON, apres: StatutQcm.NON_PUBLIE },
          }),
        }),
      );
    });

    it('remplace une configuration existante sans en créer une seconde', async () => {
      mockConfigRepo.findOne.mockResolvedValue(enBase());

      await service.configurer('u-1', 'qcm-1', dto({ dureeMaxMinutes: 45 }), contexte);

      expect(mockConfigRepo.create).not.toHaveBeenCalled();
      expect(mockConfigRepo.merge).toHaveBeenCalled();
    });

    it('ne rétrograde jamais un QCM publié', async () => {
      mockQcmRepo.findOne.mockResolvedValue({
        id: 'qcm-1',
        statut: StatutQcm.PUBLIE,
        module: { formationId: 'form-1' },
      });

      await service.configurer('u-1', 'qcm-1', dto(), contexte);

      expect(mockQcmRepo.update).not.toHaveBeenCalled();
    });

    it('409 sans question, sans rien écrire', async () => {
      mockLienRepo.countBy.mockResolvedValue(0);

      await expect(service.configurer('u-1', 'qcm-1', dto(), contexte)).rejects.toThrow(
        'Ajoutez au moins une question avant de configurer les paramètres anti-fraude.',
      );
      expect(mockConfigRepo.save).not.toHaveBeenCalled();
    });

    it('404 si le QCM n’existe pas ; 409 si la formation est archivée', async () => {
      mockQcmRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.configurer('u', 'x', dto(), contexte)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      mockFormationsService.chargerPourEcriture.mockRejectedValueOnce(new ConflictException());
      await expect(service.configurer('u', 'qcm-1', dto(), contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('QCM déjà tenté', () => {
    beforeEach(() => {
      mockTentativeRepo.countBy.mockResolvedValue(3);
      mockConfigRepo.findOne.mockResolvedValue(enBase());
    });

    it('accepte de repousser la fermeture, rien d’autre', async () => {
      await expect(
        service.configurer(
          'u',
          'qcm-1',
          dto({ dateFermeture: '2026-11-05T18:00:00.000Z' }),
          contexte,
        ),
      ).resolves.toBeDefined();
    });

    it.each([
      ['avancer la fermeture', { dateFermeture: '2026-11-02T12:00:00.000Z' }],
      ['changer la durée', { dureeMaxMinutes: 45 }],
      ['changer le seuil', { scoreMinValidation: 50 }],
      ['ajouter une tentative', { nbTentativesMax: 3 }],
    ])('409 pour %s', async (_cas, surcharge) => {
      await expect(service.configurer('u', 'qcm-1', dto(surcharge), contexte)).rejects.toThrow(
        /paramètres sont figés/,
      );
      expect(mockConfigRepo.save).not.toHaveBeenCalled();
    });
  });
});

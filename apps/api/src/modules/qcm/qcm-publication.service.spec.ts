import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { verifierPublication, verifierRetraitQuestion } from './qcm-publication.regles';
import { QcmPublicationService } from './qcm-publication.service';
import { QcmService } from './qcm.service';

/**
 * Tests unitaires de la publication d'un QCM (US-QCM-04).
 *
 * Règles de complétude, une par une avec leur message ; règle de retrait
 * d'une question d'un QCM publié ; service : passage en PUBLIE, audit
 * QCM_PUBLIE, refus sans rien écrire. Le verrou et la concurrence sont
 * couverts par les tests e2e sur la vraie base.
 */
describe('Publication d’un QCM', () => {
  const MAINTENANT = new Date('2026-10-11T12:00:00Z');
  const FERMETURE = new Date('2026-11-02T18:00:00Z');

  describe('verifierPublication', () => {
    const config = (
      nbQuestionsTirees: number | null = null,
      dateFermeture = FERMETURE,
    ): { nbQuestionsTirees: number | null; dateFermeture: Date } => ({
      nbQuestionsTirees,
      dateFermeture,
    });

    it('accepte un QCM complet', () => {
      expect(() =>
        verifierPublication({ nbQuestions: 3, configuration: config() }, MAINTENANT),
      ).not.toThrow();
      expect(() =>
        verifierPublication({ nbQuestions: 3, configuration: config(3) }, MAINTENANT),
      ).not.toThrow();
    });

    it.each([
      [
        'sans question',
        { nbQuestions: 0, configuration: config() },
        'QCM incomplet pour publication : ajoutez au moins une question.',
      ],
      [
        'sans configuration',
        { nbQuestions: 3, configuration: null },
        'QCM incomplet pour publication : configurez les paramètres anti-fraude.',
      ],
      [
        'tirage supérieur au nombre de questions',
        { nbQuestions: 2, configuration: config(3) },
        'QCM incomplet pour publication : le tirage prévoit 3 questions, le QCM n’en contient que 2. Ajoutez des questions ou réduisez le tirage.',
      ],
      [
        'fenêtre close',
        { nbQuestions: 3, configuration: config(null, new Date('2026-10-01T00:00:00Z')) },
        'La fenêtre d’ouverture de ce QCM est close : repoussez la date de fermeture avant de le publier.',
      ],
    ])('409 %s', (_cas, etat, message) => {
      expect(() => verifierPublication(etat, MAINTENANT)).toThrow(new ConflictException(message));
    });

    it('vérifie les questions AVANT la configuration', () => {
      expect(() =>
        verifierPublication({ nbQuestions: 0, configuration: null }, MAINTENANT),
      ).toThrow(/ajoutez au moins une question/);
    });
  });

  describe('verifierRetraitQuestion (QCM publié)', () => {
    it('accepte un retrait qui laisse au moins une question et au moins le tirage', () => {
      expect(() => verifierRetraitQuestion(1, null)).not.toThrow();
      expect(() => verifierRetraitQuestion(3, 3)).not.toThrow();
    });

    it('409 s’il ne resterait aucune question', () => {
      expect(() => verifierRetraitQuestion(0, null)).toThrow(
        'Ce QCM est publié : il doit garder au moins une question.',
      );
    });

    it('409 s’il resterait moins de questions que le tirage', () => {
      expect(() => verifierRetraitQuestion(2, 3)).toThrow(
        'Ce QCM est publié et tire 3 questions à chaque tentative : il doit en garder au moins 3.',
      );
    });
  });

  describe('QcmPublicationService.publier', () => {
    let service: QcmPublicationService;

    const mockQcmRepo = { findOne: jest.fn() };
    const mockManager = { findOne: jest.fn(), countBy: jest.fn(), update: jest.fn() };
    const mockDataSource = {
      transaction: jest.fn((travail: (m: typeof mockManager) => unknown) => travail(mockManager)),
    };
    const mockFormationsService = { chargerPourEcriture: jest.fn() };
    const mockQcmService = { detail: jest.fn() };
    const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    const contexte = { adresseIp: '127.0.0.1' };

    /** État lu dans la transaction : statut du QCM, configuration. */
    const enBase = (
      statut: StatutQcm,
      configuration: Partial<ConfigurationAntiFraude> | null,
      nbQuestions = 3,
    ): void => {
      mockManager.findOne.mockImplementation(async (entite: unknown) =>
        entite === Qcm ? { id: 'qcm-1', statut } : configuration,
      );
      mockManager.countBy.mockResolvedValue(nbQuestions);
    };

    const configurationComplete = {
      nbQuestionsTirees: null,
      dateOuverture: new Date('2026-11-02T08:00:00Z'),
      dateFermeture: FERMETURE,
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          QcmPublicationService,
          { provide: DataSource, useValue: mockDataSource },
          { provide: getRepositoryToken(Qcm), useValue: mockQcmRepo },
          { provide: FormationsService, useValue: mockFormationsService },
          { provide: QcmService, useValue: mockQcmService },
          { provide: AuditService, useValue: mockAuditService },
        ],
      }).compile();
      service = moduleRef.get(QcmPublicationService);

      mockQcmRepo.findOne.mockResolvedValue({ id: 'qcm-1', module: { formationId: 'form-1' } });
      mockFormationsService.chargerPourEcriture.mockResolvedValue({});
      mockQcmService.detail.mockResolvedValue({ id: 'qcm-1', statut: StatutQcm.PUBLIE });
      enBase(StatutQcm.NON_PUBLIE, configurationComplete);
    });

    it('passe le QCM en PUBLIE, journalise QCM_PUBLIE et renvoie le détail', async () => {
      const vue = await service.publier('u-1', 'qcm-1', contexte, MAINTENANT);

      expect(vue).toMatchObject({ statut: StatutQcm.PUBLIE });
      expect(mockManager.findOne).toHaveBeenCalledWith(
        Qcm,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.update).toHaveBeenCalledWith(
        Qcm,
        { id: 'qcm-1' },
        { statut: StatutQcm.PUBLIE },
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QCM_PUBLIE',
          acteur: 'u-1',
          cible: 'qcm-1',
          detailsAvantApres: expect.objectContaining({
            statut: { avant: StatutQcm.NON_PUBLIE, apres: StatutQcm.PUBLIE },
            nbQuestions: 3,
          }),
        }),
      );
    });

    it('409 « déjà publié », sans rien écrire', async () => {
      enBase(StatutQcm.PUBLIE, configurationComplete);

      await expect(service.publier('u', 'qcm-1', contexte, MAINTENANT)).rejects.toThrow(
        'Ce QCM est déjà publié.',
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('409 « incomplet » pour un brouillon sans configuration, sans rien écrire', async () => {
      enBase(StatutQcm.BROUILLON, null);

      await expect(service.publier('u', 'qcm-1', contexte, MAINTENANT)).rejects.toThrow(
        /QCM incomplet pour publication : configurez/,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('404 si le QCM n’existe pas ; 409 si la formation est archivée', async () => {
      mockQcmRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.publier('u', 'x', contexte, MAINTENANT)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      mockFormationsService.chargerPourEcriture.mockRejectedValueOnce(new ConflictException());
      await expect(service.publier('u', 'qcm-1', contexte, MAINTENANT)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });
});

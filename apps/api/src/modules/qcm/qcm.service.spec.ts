import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { QuestionDto } from './dto/question.dto';
import { QcmService } from './qcm.service';

/**
 * Tests unitaires de QcmService (US-QCM-01).
 *
 * Cœur de la story : les règles de validation d'une question, une par une,
 * avec leur message ciblé. Plus les règles transverses : statut BROUILLON
 * imposé, formation archivée, QCM verrouillé par une tentative, suppression
 * refusée d'un QCM publié. Le reste (transactions, ordre, bonnes réponses
 * renvoyées) est couvert par les tests e2e sur la vraie base.
 */
describe('QcmService', () => {
  let service: QcmService;

  const mockQcmRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const mockLienRepo = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const mockTentativeRepo = { countBy: jest.fn() };
  const mockModuleRepo = { findOne: jest.fn() };
  const mockFormationsService = { chargerPourEcriture: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
  const mockDataSource = { transaction: jest.fn(), manager: {} };

  const contexte = { adresseIp: '127.0.0.1' };

  const question = (surcharge: Partial<QuestionDto> = {}): QuestionDto =>
    ({
      enonce: 'Que désigne CI ?',
      type: TypeQuestion.QCU,
      options: [
        { texte: 'Intégration continue', estCorrecte: true },
        { texte: 'Interface client', estCorrecte: false },
      ],
      ...surcharge,
    }) as QuestionDto;

  const qcmExistant = (statut: StatutQcm = StatutQcm.BROUILLON): Partial<Qcm> => ({
    id: 'qcm-1',
    moduleId: 'mod-1',
    titre: 'Quiz',
    statut,
    module: { id: 'mod-1', formationId: 'form-1' } as ModuleFormation,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        QcmService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(Qcm), useValue: mockQcmRepo },
        { provide: getRepositoryToken(QcmQuestion), useValue: mockLienRepo },
        { provide: getRepositoryToken(TentativeQcm), useValue: mockTentativeRepo },
        { provide: getRepositoryToken(ModuleFormation), useValue: mockModuleRepo },
        { provide: getRepositoryToken(ConfigurationAntiFraude), useValue: { findOne: jest.fn() } },
        { provide: FormationsService, useValue: mockFormationsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get(QcmService);

    mockFormationsService.chargerPourEcriture.mockResolvedValue({ id: 'form-1' });
    mockTentativeRepo.countBy.mockResolvedValue(0);
    mockQcmRepo.create.mockImplementation((v) => v);
    mockQcmRepo.save.mockImplementation(async (v) => ({
      id: 'qcm-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...v,
    }));
  });

  describe('validerQuestion', () => {
    it('accepte un QCU valide et normalise (textes rognés, pondération 1 par défaut)', () => {
      const v = service.validerQuestion(
        question({
          enonce: '  Que désigne CI ?  ',
          options: [
            { texte: ' Intégration continue ', estCorrecte: true },
            { texte: 'Interface client', estCorrecte: false },
          ],
        }),
      );
      expect(v).toMatchObject({
        enonce: 'Que désigne CI ?',
        ponderation: 1,
        explication: null,
        niveauDifficulte: null,
      });
      expect(v.options[0].texte).toBe('Intégration continue');
    });

    it('accepte un QCM à plusieurs bonnes réponses', () => {
      expect(() =>
        service.validerQuestion(
          question({
            type: TypeQuestion.QCM,
            options: [
              { texte: 'A', estCorrecte: true },
              { texte: 'B', estCorrecte: true },
              { texte: 'C', estCorrecte: false },
            ],
          }),
        ),
      ).not.toThrow();
    });

    it.each([
      ['une seule option', { options: [{ texte: 'A', estCorrecte: true }] }, /au moins 2 options/],
      [
        'onze options',
        {
          type: TypeQuestion.QCM,
          options: Array.from({ length: 11 }, (_, i) => ({ texte: `O${i}`, estCorrecte: i === 0 })),
        },
        /plus de 10 options/,
      ],
      [
        'aucune bonne réponse',
        {
          options: [
            { texte: 'A', estCorrecte: false },
            { texte: 'B', estCorrecte: false },
          ],
        },
        /au moins une bonne réponse/,
      ],
      [
        'un QCU à deux bonnes réponses',
        {
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'B', estCorrecte: true },
          ],
        },
        /exactement une bonne réponse/,
      ],
      [
        'deux options identiques (casse ignorée)',
        {
          options: [
            { texte: 'Docker', estCorrecte: true },
            { texte: ' docker ', estCorrecte: false },
          ],
        },
        /même texte/,
      ],
      [
        'un Vrai/Faux à trois options',
        {
          type: TypeQuestion.VRAI_FAUX,
          options: [
            { texte: 'Vrai', estCorrecte: true },
            { texte: 'Faux', estCorrecte: false },
            { texte: 'Peut-être', estCorrecte: false },
          ],
        },
        /Vrai\/Faux doit avoir exactement 2 options/,
      ],
      [
        'un type sans correction définie',
        { type: TypeQuestion.REPONSE_COURTE },
        /n’est pas encore pris en charge/,
      ],
      ['un énoncé blanc', { enonce: '   ' }, /énoncé est obligatoire/],
      [
        'une option blanche',
        {
          options: [
            { texte: '  ', estCorrecte: true },
            { texte: 'B', estCorrecte: false },
          ],
        },
        /option ne peut pas être vide/,
      ],
    ])('refuse (400) %s avec un message ciblé', (_cas, surcharge, message) => {
      expect(() => service.validerQuestion(question(surcharge as Partial<QuestionDto>))).toThrow(
        message,
      );
      expect(() => service.validerQuestion(question(surcharge as Partial<QuestionDto>))).toThrow(
        BadRequestException,
      );
    });
  });

  describe('creer', () => {
    it('crée le QCM au statut BROUILLON, créateur = acteur, et journalise QCM_CREE', async () => {
      mockModuleRepo.findOne.mockResolvedValue({ id: 'mod-1', formationId: 'form-1' });

      const vue = await service.creer('form-user-1', 'mod-1', { titre: '  Quiz  ' }, contexte);

      expect(mockQcmRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'mod-1',
          formateurId: 'form-user-1',
          titre: 'Quiz',
          description: null,
          statut: StatutQcm.BROUILLON,
        }),
      );
      expect(vue).toMatchObject({ statut: StatutQcm.BROUILLON, nbQuestions: 0 });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'QCM_CREE', acteur: 'form-user-1', cible: 'qcm-1' }),
      );
    });

    it('404 si le module n’existe pas', async () => {
      mockModuleRepo.findOne.mockResolvedValue(null);

      await expect(service.creer('u', 'mod-x', { titre: 'Q' }, contexte)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409 si la formation est archivée, sans rien écrire', async () => {
      mockModuleRepo.findOne.mockResolvedValue({ id: 'mod-1', formationId: 'form-1' });
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );

      await expect(service.creer('u', 'mod-1', { titre: 'Q' }, contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockQcmRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('QCM verrouillé (tentatives existantes)', () => {
    beforeEach(() => {
      mockQcmRepo.findOne.mockResolvedValue(qcmExistant());
      mockTentativeRepo.countBy.mockResolvedValue(1);
    });

    it('refuse (409) l’ajout d’une question', async () => {
      await expect(service.ajouterQuestion('u', 'qcm-1', question(), contexte)).rejects.toThrow(
        /seules les explications restent modifiables/,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuse (409) la suppression d’une question', async () => {
      await expect(service.supprimerQuestion('u', 'qcm-1', 'q-1', contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuse (409) le réordonnancement', async () => {
      await expect(
        service.reordonnerQuestions('u', 'qcm-1', ['q-1'], contexte),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuse (409) la suppression du QCM', async () => {
      await expect(service.supprimer('u', 'qcm-1', contexte)).rejects.toThrow(
        /ne peut plus être supprimé/,
      );
    });
  });

  describe('supprimer', () => {
    it('refuse (409) un QCM publié', async () => {
      mockQcmRepo.findOne.mockResolvedValue(qcmExistant(StatutQcm.PUBLIE));

      await expect(service.supprimer('u', 'qcm-1', contexte)).rejects.toThrow(
        'Un QCM publié ne peut pas être supprimé.',
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('404 si le QCM n’existe pas', async () => {
      mockQcmRepo.findOne.mockResolvedValue(null);

      await expect(service.supprimer('u', 'qcm-x', contexte)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('modifier', () => {
    it('refuse (400) un corps sans aucun champ', async () => {
      mockQcmRepo.findOne.mockResolvedValue(qcmExistant());

      await expect(service.modifier('u', 'qcm-1', {}, contexte)).rejects.toThrow(
        'Aucune modification fournie.',
      );
    });

    it('refuse (400) un titre vidé', async () => {
      mockQcmRepo.findOne.mockResolvedValue(qcmExistant());

      await expect(
        service.modifier('u', 'qcm-1', { titre: null as unknown as string }, contexte),
      ).rejects.toThrow('Le titre ne peut pas être vide.');
    });
  });
});

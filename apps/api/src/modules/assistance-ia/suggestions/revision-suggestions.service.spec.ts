import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SuggestionQuestionIa } from '../../../database/entities/suggestion-question-ia.entity';
import { OrigineQuestion } from '../../../database/enums/origine-question.enum';
import { StatutSuggestion } from '../../../database/enums/statut-suggestion.enum';
import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { QcmService } from '../../qcm/qcm.service';
import { MESSAGE_QCM_AUTRE_MODULE, MESSAGE_SUGGESTION_DECIDEE } from './revision.regles';
import { RevisionSuggestionsService } from './revision-suggestions.service';

/**
 * RevisionSuggestionsService (US-IA-04) : base, QcmService, audit simulés. Les
 * garanties en base (CHECK, déclencheur), les vraies règles de l'éditeur de
 * QCM et la concurrence sont éprouvées par l'e2e (E2E-IAREV).
 */
describe('RevisionSuggestionsService (US-IA-04)', () => {
  let service: RevisionSuggestionsService;

  const options = [
    { texte: 'RS256', estCorrecte: true },
    { texte: 'MD5', estCorrecte: false },
  ];
  let suggestion: Partial<SuggestionQuestionIa>;
  let verrou: { statut: StatutSuggestion } | null;

  const mockManager = {
    findOne: jest.fn(async (_e: unknown, o: { lock?: unknown }) => (o.lock ? verrou : suggestion)),
    findOneOrFail: jest.fn(async () => ({ ...suggestion, statut: StatutSuggestion.ACCEPTEE })),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockQcm = {
    exigerAjoutPossible: jest.fn(),
    validerQuestion: jest.fn((dto: Record<string, unknown>) => ({
      enonce: (dto.enonce as string).trim(),
      type: dto.type,
      ponderation: (dto.ponderation as number) ?? 1,
      explication: (dto.explication as string) ?? null,
      niveauDifficulte: (dto.niveauDifficulte as string) ?? null,
      options: dto.options,
    })),
    insererQuestionEnFin: jest.fn(async () => 'q-9'),
    vueQuestion: jest.fn(async () => ({ id: 'q-9' })),
  };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockAudit = { record: jest.fn() };
  const contexte = { adresseIp: '10.0.0.1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    suggestion = {
      id: 's-1',
      generationId: 'g-1',
      ordre: 1,
      enonce: 'Quel algorithme signe un JWT ?',
      type: 'QCU',
      options,
      explication: 'Passage 2.',
      statut: StatutSuggestion.PROPOSEE,
      generation: {
        id: 'g-1',
        moduleId: 'm-1',
        niveau: 'AVANCE',
        module: { id: 'm-1', formationId: 'f-1' },
      } as never,
    };
    verrou = { statut: StatutSuggestion.PROPOSEE };
    mockQcm.exigerAjoutPossible.mockResolvedValue({ moduleId: 'm-1', formationId: 'f-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevisionSuggestionsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: QcmService, useValue: mockQcm },
        { provide: FormationsService, useValue: mockFormations },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(RevisionSuggestionsService);
  });

  const miseAJour = (): unknown[] =>
    mockManager.query.mock.calls.find((c) => String(c[0]).includes('UPDATE suggestions'))?.[1] ??
    [];

  describe('accepter', () => {
    it('telle quelle : origine IA, ACCEPTEE, sous verrou, audit, réponse', async () => {
      const r = await service.accepter('u-1', 's-1', { qcmId: 'qcm-1' }, contexte);
      expect(mockQcm.exigerAjoutPossible).toHaveBeenCalledWith('qcm-1');
      expect(mockQcm.validerQuestion).toHaveBeenCalledWith({
        enonce: 'Quel algorithme signe un JWT ?',
        type: TypeQuestion.QCU,
        explication: 'Passage 2.',
        niveauDifficulte: 'AVANCE',
        options,
      });
      expect(mockManager.findOne).toHaveBeenCalledWith(SuggestionQuestionIa, {
        where: { id: 's-1' },
        lock: { mode: 'pessimistic_write' },
        select: { id: true, statut: true },
      });
      expect(mockQcm.insererQuestionEnFin).toHaveBeenCalledWith(
        mockManager,
        'qcm-1',
        expect.objectContaining({ enonce: 'Quel algorithme signe un JWT ?' }),
        OrigineQuestion.IA,
      );
      expect(miseAJour()).toEqual(['s-1', StatutSuggestion.ACCEPTEE, 'q-9', 'qcm-1', 'u-1']);
      expect(mockAudit.record).toHaveBeenCalledWith({
        action: 'SUGGESTION_ACCEPTEE',
        acteur: 'u-1',
        cible: 's-1',
        adresseIp: '10.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: { generationId: 'g-1', qcmId: 'qcm-1', questionId: 'q-9' },
      });
      expect(r.question).toEqual({ id: 'q-9' });
      expect(mockQcm.vueQuestion).toHaveBeenCalledWith('qcm-1', 'q-9');
    });

    it('version identique envoyée : reste ACCEPTEE (origine IA)', async () => {
      await service.accepter(
        'u-1',
        's-1',
        {
          qcmId: 'qcm-1',
          question: {
            enonce: '  Quel algorithme signe un JWT ? ',
            type: TypeQuestion.QCU,
            explication: 'Passage 2.',
            niveauDifficulte: 'AVANCE',
            options,
          },
        },
        contexte,
      );
      expect((mockQcm.insererQuestionEnFin.mock.calls[0] as unknown[])[3]).toBe(OrigineQuestion.IA);
    });

    it('version retouchée : origine IA_MODIFIEE, MODIFIEE, audit avec avant / après', async () => {
      await service.accepter(
        'u-1',
        's-1',
        {
          qcmId: 'qcm-1',
          question: {
            enonce: 'Quel algorithme asymétrique signe un JWT ?',
            type: TypeQuestion.QCU,
            explication: 'Passage 2.',
            niveauDifficulte: 'AVANCE',
            options,
          },
        },
        contexte,
      );
      expect((mockQcm.insererQuestionEnFin.mock.calls[0] as unknown[])[3]).toBe(
        OrigineQuestion.IA_MODIFIEE,
      );
      expect(miseAJour()[1]).toBe(StatutSuggestion.MODIFIEE);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUGGESTION_MODIFIEE',
          detailsAvantApres: expect.objectContaining({
            avant: { enonce: 'Quel algorithme signe un JWT ?', type: 'QCU', nbOptions: 2 },
            apres: {
              enonce: 'Quel algorithme asymétrique signe un JWT ?',
              type: 'QCU',
              nbOptions: 2,
            },
          }),
        }),
      );
    });

    it('QCM d’un autre module : 400, rien d’écrit', async () => {
      mockQcm.exigerAjoutPossible.mockResolvedValue({ moduleId: 'm-2', formationId: 'f-1' });
      await expect(service.accepter('u-1', 's-1', { qcmId: 'qcm-2' }, contexte)).rejects.toThrow(
        new BadRequestException(MESSAGE_QCM_AUTRE_MODULE),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('question retouchée non conforme : erreur de l’éditeur de QCM, rien d’écrit', async () => {
      mockQcm.validerQuestion
        .mockImplementationOnce((dto) => dto as never)
        .mockImplementationOnce(() => {
          throw new BadRequestException('Une question doit avoir au moins une bonne réponse.');
        });
      await expect(
        service.accepter(
          'u-1',
          's-1',
          { qcmId: 'qcm-1', question: { enonce: 'x', type: TypeQuestion.QCU, options: [] } },
          contexte,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('déjà décidée (lecture) : 409 sans toucher au QCM', async () => {
      suggestion = { ...suggestion, statut: StatutSuggestion.REJETEE };
      await expect(service.accepter('u-1', 's-1', { qcmId: 'qcm-1' }, contexte)).rejects.toThrow(
        new ConflictException(MESSAGE_SUGGESTION_DECIDEE),
      );
      expect(mockQcm.exigerAjoutPossible).not.toHaveBeenCalled();
    });

    it('décidée entre-temps (sous verrou) : 409, aucune question créée', async () => {
      verrou = { statut: StatutSuggestion.ACCEPTEE };
      await expect(service.accepter('u-1', 's-1', { qcmId: 'qcm-1' }, contexte)).rejects.toThrow(
        new ConflictException(MESSAGE_SUGGESTION_DECIDEE),
      );
      expect(mockQcm.insererQuestionEnFin).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('supprimée entre-temps : 404', async () => {
      verrou = null;
      await expect(
        service.accepter('u-1', 's-1', { qcmId: 'qcm-1' }, contexte),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('suggestion inconnue : 404', async () => {
      suggestion = null as never;
      await expect(
        service.accepter('u-1', 's-1', { qcmId: 'qcm-1' }, contexte),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rejeter', () => {
    it('REJETEE avec motif nettoyé, formation vérifiée, sous verrou, audit', async () => {
      await service.rejeter('u-1', 's-1', { motif: '  hors   sujet ' }, contexte);
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      const [sql, params] = mockManager.query.mock.calls[0];
      expect(String(sql)).toContain("statut = 'REJETEE'");
      expect(params).toEqual(['s-1', 'hors sujet', 'u-1']);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUGGESTION_REJETEE',
          cible: 's-1',
          detailsAvantApres: { generationId: 'g-1', motif: 'hors sujet' },
        }),
      );
    });

    it('sans motif : motif null', async () => {
      await service.rejeter('u-1', 's-1', {}, contexte);
      expect(mockManager.query.mock.calls[0][1]).toEqual(['s-1', null, 'u-1']);
    });

    it('formation archivée : erreur de FormationsService, rien d’écrit', async () => {
      mockFormations.chargerPourEcriture.mockRejectedValue(new ConflictException('archivée'));
      await expect(service.rejeter('u-1', 's-1', {}, contexte)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      mockFormations.chargerPourEcriture.mockReset();
    });

    it('décidée entre-temps : 409', async () => {
      verrou = { statut: StatutSuggestion.MODIFIEE };
      await expect(service.rejeter('u-1', 's-1', {}, contexte)).rejects.toThrow(
        new ConflictException(MESSAGE_SUGGESTION_DECIDEE),
      );
      expect(mockManager.query).not.toHaveBeenCalled();
    });
  });
});

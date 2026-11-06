import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { TentativeConsultationService } from './tentative-consultation.service';
import { TentativeTirageService } from './tentative-tirage.service';

/**
 * Tests unitaires de la consultation d'une tentative (US-QCM-05 D14,
 * US-QCM-06) : seul son apprenant la voit (404 sinon), rang et heure du
 * serveur, questions du plan pendant le temps de passage seulement, tirage
 * tardif unique pour une tentative créée avant le tirage (D8), réponses
 * enregistrées pour restaurer la page (US-QCM-07, D8/D15).
 */
describe('TentativeConsultationService', () => {
  const MAINTENANT = new Date('2026-11-02T10:05:00Z');
  const DEBUT = new Date('2026-11-02T10:00:00Z');
  const PLAN = [{ questionId: 'q1', optionIds: ['b', 'a'] }];
  const QUESTIONS = [
    {
      id: 'q1',
      enonce: 'Combien ?',
      type: TypeQuestion.QCU,
      options: [
        { id: 'b', texte: 'Deux' },
        { id: 'a', texte: 'Un' },
      ],
    },
  ];

  let service: TentativeConsultationService;
  let tentativeRepository: { findOne: jest.Mock; countBy: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock; manager: { find: jest.Mock } };
  let tirageService: { tirer: jest.Mock; presenter: jest.Mock };
  let manager: { findOneOrFail: jest.Mock; update: jest.Mock };

  const tentative = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 't-1',
    apprenantId: 'appr-1',
    qcmId: 'qcm-1',
    statut: StatutTentative.EN_COURS,
    dateDebut: DEBUT,
    dateLimite: new Date('2026-11-02T10:30:00Z'),
    dateFin: null,
    planTirage: PLAN,
    qcm: {
      titre: 'Quiz Docker',
      module: { formationId: 'form-1' },
      configuration: {
        dureeMaxMinutes: 30,
        nbTentativesMax: 3,
        randomiserQuestions: true,
        randomiserOptions: true,
        nbQuestionsTirees: null,
      },
    },
    ...surcharge,
  });

  beforeEach(async () => {
    tentativeRepository = {
      findOne: jest.fn().mockResolvedValue(tentative()),
      countBy: jest.fn().mockResolvedValue(2),
      save: jest.fn(),
    };
    manager = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 't-1', qcmId: 'qcm-1', planTirage: null }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([{ maintenant: MAINTENANT }]),
      transaction: jest.fn((travail: (m: typeof manager) => Promise<unknown>) => travail(manager)),
      // Réponses enregistrées : q1 cochée sur « a » ; une question hors plan est ignorée.
      manager: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            questionId: 'q1',
            optionsSelectionnees: [{ reponseId: 'r1', optionId: 'a' }],
          },
          {
            id: 'r9',
            questionId: 'q9',
            optionsSelectionnees: [{ reponseId: 'r9', optionId: 'z' }],
          },
        ]),
      },
    };
    tirageService = {
      tirer: jest.fn().mockResolvedValue(PLAN),
      presenter: jest.fn().mockResolvedValue(QUESTIONS),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeConsultationService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(TentativeQcm), useValue: tentativeRepository },
        { provide: TentativeTirageService, useValue: tirageService },
      ],
    }).compile();
    service = moduleRef.get(TentativeConsultationService);
  });

  it('renvoie ma tentative, son rang, l’heure du serveur et les questions du plan', async () => {
    await expect(service.consulter('appr-1', 't-1')).resolves.toEqual({
      id: 't-1',
      qcmId: 'qcm-1',
      qcmTitre: 'Quiz Docker',
      formationId: 'form-1',
      statut: StatutTentative.EN_COURS,
      dateDebut: DEBUT,
      dateLimite: new Date('2026-11-02T10:30:00Z'),
      dateFin: null,
      score: null,
      estReussie: null,
      dureeMaxMinutes: 30,
      numero: 2,
      nbTentativesMax: 3,
      tentativesRestantes: 1,
      maintenant: MAINTENANT,
      nbQuestions: 1,
      questions: QUESTIONS,
      reponses: { q1: ['a'] },
    });
    expect(tentativeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1', apprenantId: 'appr-1' } }),
    );
    expect(tirageService.presenter).toHaveBeenCalledWith(dataSource.manager, PLAN);
    // Plan déjà figé : aucun nouveau tirage, aucune écriture.
    expect(tirageService.tirer).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(tentativeRepository.save).not.toHaveBeenCalled();
  });

  it('404 pour une tentative inconnue ou celle d’un autre apprenant (même réponse)', async () => {
    tentativeRepository.findOne.mockResolvedValue(null);
    await expect(service.consulter('appr-2', 't-1')).rejects.toThrow(
      new NotFoundException('Tentative introuvable.'),
    );
  });

  it.each([
    ['échéance atteinte', { dateLimite: MAINTENANT }],
    ['tentative notée', { statut: StatutTentative.NOTEE }],
  ])('aucune question hors du temps de passage (%s)', async (_cas, surcharge) => {
    tentativeRepository.findOne.mockResolvedValue(tentative(surcharge));
    const vue = await service.consulter('appr-1', 't-1');
    expect(vue.questions).toEqual([]);
    expect(vue.nbQuestions).toBe(1);
    expect(tirageService.presenter).not.toHaveBeenCalled();
    // Réponses restaurées seulement pendant le passage (D15) ; la lecture n'écrit rien.
    expect(vue.reponses).toEqual({});
    expect(dataSource.manager.find).not.toHaveBeenCalled();
  });

  it('score et réussite seulement une fois NOTEE (US-QCM-08)', async () => {
    tentativeRepository.findOne.mockResolvedValue(
      tentative({ statut: StatutTentative.NOTEE, score: 75, estReussie: true }),
    );
    await expect(service.consulter('appr-1', 't-1')).resolves.toMatchObject({
      statut: StatutTentative.NOTEE,
      score: 75,
      estReussie: true,
    });
    tentativeRepository.findOne.mockResolvedValue(
      tentative({ statut: StatutTentative.SOUMISE, score: 75, estReussie: true }),
    );
    await expect(service.consulter('appr-1', 't-1')).resolves.toMatchObject({
      score: null,
      estReussie: null,
    });
  });

  it('range les options cochées dans l’ordre du tirage, pas dans celui de l’enregistrement', async () => {
    dataSource.manager.find.mockResolvedValue([
      {
        id: 'r1',
        questionId: 'q1',
        optionsSelectionnees: [
          { reponseId: 'r1', optionId: 'a' },
          { reponseId: 'r1', optionId: 'b' },
        ],
      },
    ]);
    const vue = await service.consulter('appr-1', 't-1');
    expect(vue.reponses).toEqual({ q1: ['b', 'a'] });
  });

  describe('tentative créée avant le tirage (D8)', () => {
    beforeEach(() => {
      tentativeRepository.findOne.mockResolvedValue(tentative({ planTirage: null }));
    });

    it('tire une seule fois, sous verrou, et enregistre le plan', async () => {
      const vue = await service.consulter('appr-1', 't-1');

      expect(manager.findOneOrFail).toHaveBeenCalledWith(
        TentativeQcm,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(tirageService.tirer).toHaveBeenCalledWith(
        manager,
        'qcm-1',
        expect.objectContaining({ randomiserQuestions: true }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        TentativeQcm,
        { id: 't-1' },
        { planTirage: PLAN },
      );
      expect(vue.questions).toEqual(QUESTIONS);
    });

    it('reprend le plan posé entre-temps par une lecture concurrente, sans retirer', async () => {
      manager.findOneOrFail.mockResolvedValue({ id: 't-1', qcmId: 'qcm-1', planTirage: PLAN });
      await service.consulter('appr-1', 't-1');
      expect(tirageService.tirer).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('ne tire rien pour une tentative hors du temps de passage', async () => {
      tentativeRepository.findOne.mockResolvedValue(
        tentative({ planTirage: null, statut: StatutTentative.ABANDONNEE_TIMER }),
      );
      const vue = await service.consulter('appr-1', 't-1');
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(vue).toMatchObject({ nbQuestions: 0, questions: [] });
    });
  });
});

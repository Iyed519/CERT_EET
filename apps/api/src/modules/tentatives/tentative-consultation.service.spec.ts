import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { TentativeConsultationService } from './tentative-consultation.service';
import { TentativeCorrectionService } from './tentative-correction.service';
import { TentativeSessionService } from './tentative-session.service';
import { TentativeTirageService } from './tentative-tirage.service';

/**
 * Tests unitaires de la consultation d'une tentative (US-QCM-05 D14,
 * US-QCM-06) : seul son apprenant la voit (404 sinon), rang et heure du
 * serveur, questions du plan pendant le temps de passage seulement, tirage
 * tardif unique pour une tentative créée avant le tirage (D8), réponses
 * enregistrées pour restaurer la page (US-QCM-07, D8/D15), état du corrigé
 * transmis tel quel, sans aucune réponse (US-QCM-09, D12).
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
  let correctionService: { etat: jest.Mock };
  let session: { controler: jest.Mock; armerMiroir: jest.Mock; refuser: jest.Mock };
  const SESSION = 's0000000-0000-4000-8000-000000000001';
  const AUTRE_SESSION = 's0000000-0000-4000-8000-000000000002';
  const CONTEXTE = { sessionId: SESSION, adresseIp: '127.0.0.1', route: '/api/tentatives/t-1' };
  const ETAT_CORRECTION = {
    mode: AffichageResultats.IMMEDIAT,
    disponible: false,
    raison: 'non_notee',
    disponibleLe: null,
  };

  const tentative = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 't-1',
    apprenantId: 'appr-1',
    qcmId: 'qcm-1',
    statut: StatutTentative.EN_COURS,
    dateDebut: DEBUT,
    dateLimite: new Date('2026-11-02T10:30:00Z'),
    dateFin: null,
    planTirage: PLAN,
    sessionId: SESSION,
    qcm: {
      titre: 'Quiz Docker',
      module: { formationId: 'form-1' },
      configuration: {
        dureeMaxMinutes: 30,
        nbTentativesMax: 3,
        randomiserQuestions: true,
        randomiserOptions: true,
        nbQuestionsTirees: null,
        blocageSessionsMultiples: true,
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
    session = {
      controler: jest.fn().mockResolvedValue('autorisee'),
      armerMiroir: jest.fn().mockResolvedValue(undefined),
      refuser: jest.fn().mockRejectedValue(new ConflictException('session')),
    };
    correctionService = { etat: jest.fn().mockResolvedValue(ETAT_CORRECTION) };
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
        { provide: TentativeCorrectionService, useValue: correctionService },
        { provide: TentativeSessionService, useValue: session },
      ],
    }).compile();
    service = moduleRef.get(TentativeConsultationService);
  });

  it('renvoie ma tentative, son rang, l’heure du serveur et les questions du plan', async () => {
    await expect(service.consulter('appr-1', 't-1', CONTEXTE)).resolves.toEqual({
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
      correction: ETAT_CORRECTION,
    });
    // L'état du corrigé est calculé à l'heure de la base, pour CETTE tentative.
    expect(correctionService.etat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't-1', apprenantId: 'appr-1', qcmId: 'qcm-1' }),
      expect.objectContaining({ nbTentativesMax: 3 }),
      MAINTENANT,
    );
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
    await expect(service.consulter('appr-2', 't-1', CONTEXTE)).rejects.toThrow(
      new NotFoundException('Tentative introuvable.'),
    );
  });

  it.each([
    ['échéance atteinte', { dateLimite: MAINTENANT }],
    ['tentative notée', { statut: StatutTentative.NOTEE }],
  ])('aucune question hors du temps de passage (%s)', async (_cas, surcharge) => {
    tentativeRepository.findOne.mockResolvedValue(tentative(surcharge));
    const vue = await service.consulter('appr-1', 't-1', CONTEXTE);
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
    await expect(service.consulter('appr-1', 't-1', CONTEXTE)).resolves.toMatchObject({
      statut: StatutTentative.NOTEE,
      score: 75,
      estReussie: true,
    });
    tentativeRepository.findOne.mockResolvedValue(
      tentative({ statut: StatutTentative.SOUMISE, score: 75, estReussie: true }),
    );
    await expect(service.consulter('appr-1', 't-1', CONTEXTE)).resolves.toMatchObject({
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
    const vue = await service.consulter('appr-1', 't-1', CONTEXTE);
    expect(vue.reponses).toEqual({ q1: ['b', 'a'] });
  });

  describe('tentative créée avant le tirage (D8)', () => {
    beforeEach(() => {
      tentativeRepository.findOne.mockResolvedValue(tentative({ planTirage: null }));
    });

    it('tire une seule fois, sous verrou, et enregistre le plan', async () => {
      const vue = await service.consulter('appr-1', 't-1', CONTEXTE);

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
      await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(tirageService.tirer).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('ne tire rien pour une tentative hors du temps de passage', async () => {
      tentativeRepository.findOne.mockResolvedValue(
        tentative({ planTirage: null, statut: StatutTentative.ABANDONNEE_TIMER }),
      );
      const vue = await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(vue).toMatchObject({ nbQuestions: 0, questions: [] });
    });
  });

  describe('US-QCM-10 — verrou de session pendant le passage (D4)', () => {
    const autreSession = (surcharge: Record<string, unknown> = {}): Record<string, unknown> =>
      tentative({ sessionId: AUTRE_SESSION, ...surcharge });

    it('même session : aucun contrôle, aucune transaction', async () => {
      await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(session.controler).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('autre session ouverte -> 409 sous le verrou de la tentative, aucune question', async () => {
      tentativeRepository.findOne.mockResolvedValue(autreSession());
      manager.findOneOrFail.mockResolvedValue({ id: 't-1', sessionId: AUTRE_SESSION });
      session.controler.mockResolvedValue('refusee');

      await expect(service.consulter('appr-1', 't-1', CONTEXTE)).rejects.toThrow(ConflictException);
      expect(manager.findOneOrFail).toHaveBeenCalledWith(
        TentativeQcm,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(session.refuser).toHaveBeenCalledWith({
        apprenantId: 'appr-1',
        tentativeId: 't-1',
        qcmId: 'qcm-1',
        adresseIp: '127.0.0.1',
        route: CONTEXTE.route,
      });
      expect(tirageService.presenter).not.toHaveBeenCalled();
    });

    it('session détentrice terminée -> adoptée, miroir reposé, questions servies', async () => {
      tentativeRepository.findOne.mockResolvedValue(autreSession());
      manager.findOneOrFail.mockResolvedValue({ id: 't-1', sessionId: AUTRE_SESSION });
      session.controler.mockResolvedValue('adoptee');

      const vue = await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(vue.questions).toEqual(QUESTIONS);
      expect(session.armerMiroir).toHaveBeenCalledWith(
        'appr-1',
        'qcm-1',
        SESSION,
        new Date('2026-11-02T10:30:00Z'),
      );
    });

    it('blocage désactivé : aucun contrôle', async () => {
      const t = autreSession();
      (t.qcm as { configuration: Record<string, unknown> }).configuration.blocageSessionsMultiples =
        false;
      tentativeRepository.findOne.mockResolvedValue(t);
      await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(session.controler).not.toHaveBeenCalled();
    });

    it('tentative terminée : consultable de partout', async () => {
      tentativeRepository.findOne.mockResolvedValue(
        autreSession({ statut: StatutTentative.NOTEE, dateFin: MAINTENANT }),
      );
      await service.consulter('appr-1', 't-1', CONTEXTE);
      expect(session.controler).not.toHaveBeenCalled();
    });
  });
});

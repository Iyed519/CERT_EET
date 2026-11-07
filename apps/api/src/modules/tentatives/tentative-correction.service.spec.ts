import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import {
  MESSAGE_CORRECTION_DIFFEREE,
  MESSAGE_CORRECTION_NON_NOTEE,
} from './tentative-correction.regles';
import { TentativeCorrectionService } from './tentative-correction.service';

/**
 * Tests unitaires du service du corrigé (US-QCM-09) : 404 pour la tentative
 * d'un autre apprenant, 409 avec `raison` et `disponibleLe` tant que le
 * corrigé n'est pas disponible (rien d'autre n'est lu), heure de la base,
 * comptage de MES tentatives, bonnes options lues par une requête explicite,
 * corrigé assemblé dans l'ordre du tirage. Aucune écriture.
 */
describe('TentativeCorrectionService', () => {
  const MAINTENANT = new Date('2026-11-10T12:00:00Z');
  const FERMETURE = new Date('2026-11-10T18:00:00Z');
  const PLAN = [{ questionId: 'q1', optionIds: ['b', 'a'] }];

  let service: TentativeCorrectionService;
  let tentativeRepository: { findOne: jest.Mock };
  let manager: { find: jest.Mock; query: jest.Mock };
  let dataSource: { query: jest.Mock; manager: typeof manager };

  const tentative = (
    surcharge: Record<string, unknown> = {},
    configuration: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 't-1',
    apprenantId: 'appr-1',
    qcmId: 'qcm-1',
    statut: StatutTentative.NOTEE,
    score: 100,
    estReussie: true,
    planTirage: PLAN,
    qcm: {
      titre: 'Quiz HTTP',
      configuration: {
        affichageResultats: AffichageResultats.IMMEDIAT,
        dateFermeture: FERMETURE,
        nbTentativesMax: 1,
        scoreMinValidation: 60,
        ...configuration,
      },
    },
    ...surcharge,
  });

  /** Heure de la base, puis comptage de mes tentatives sur ce QCM. */
  const horlogeEtCompte = (passees = 1, enCours = 0): void => {
    dataSource.query
      .mockResolvedValueOnce([{ maintenant: MAINTENANT }])
      .mockResolvedValueOnce([{ passees, enCours }]);
  };

  beforeEach(async () => {
    tentativeRepository = { findOne: jest.fn().mockResolvedValue(tentative()) };
    manager = {
      find: jest
        .fn()
        // Questions du tirage (sans estCorrecte), puis réponses notées.
        .mockResolvedValueOnce([
          {
            id: 'q1',
            enonce: 'Port HTTP ?',
            type: TypeQuestion.QCU,
            ponderation: 1,
            explication: 'Port 80.',
            options: [
              { id: 'a', texte: '80' },
              { id: 'b', texte: '443' },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'r1',
            questionId: 'q1',
            estCorrecte: true,
            pointsObtenus: 1,
            optionsSelectionnees: [{ reponseId: 'r1', optionId: 'a' }],
          },
        ]),
      query: jest.fn().mockResolvedValue([{ id: 'a' }]),
    };
    dataSource = { query: jest.fn(), manager };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeCorrectionService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(TentativeQcm), useValue: tentativeRepository },
      ],
    }).compile();
    service = moduleRef.get(TentativeCorrectionService);
  });

  it('renvoie le corrigé dans l’ordre du tirage, avec ma réponse et les bonnes options', async () => {
    horlogeEtCompte();
    await expect(service.corriger('appr-1', 't-1')).resolves.toEqual({
      tentativeId: 't-1',
      qcmId: 'qcm-1',
      qcmTitre: 'Quiz HTTP',
      mode: AffichageResultats.IMMEDIAT,
      score: 100,
      estReussie: true,
      scoreMinValidation: 60,
      nbQuestions: 1,
      nbCorrectes: 1,
      questions: [
        {
          id: 'q1',
          enonce: 'Port HTTP ?',
          type: TypeQuestion.QCU,
          ponderation: 1,
          repondue: true,
          estCorrecte: true,
          pointsObtenus: 1,
          explication: 'Port 80.',
          options: [
            { id: 'b', texte: '443', cochee: false, estCorrecte: false },
            { id: 'a', texte: '80', cochee: true, estCorrecte: true },
          ],
        },
      ],
    });
    expect(tentativeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1', apprenantId: 'appr-1' } }),
    );
    // Bonnes options : requête EXPLICITE, limitée aux questions du tirage.
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('est_correcte = true'), [
      ['q1'],
    ]);
    // Les questions sont chargées sans jamais demander estCorrecte.
    const selectQuestions = manager.find.mock.calls[0][1].select;
    expect(selectQuestions.options).toEqual({ id: true, texte: true });
  });

  it('compte MES tentatives sur CE QCM (et celles EN_COURS)', async () => {
    horlogeEtCompte();
    await service.corriger('appr-1', 't-1');
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM tentatives_qcm'),
      ['appr-1', 'qcm-1', StatutTentative.EN_COURS],
    );
  });

  it('404 pour une tentative inconnue ou celle d’un autre apprenant (même réponse)', async () => {
    tentativeRepository.findOne.mockResolvedValue(null);
    await expect(service.corriger('appr-2', 't-1')).rejects.toThrow(
      new NotFoundException('Tentative introuvable.'),
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('409 non_notee pour une tentative pas encore notée, sans rien lire du contenu', async () => {
    tentativeRepository.findOne.mockResolvedValue(tentative({ statut: StatutTentative.SOUMISE }));
    horlogeEtCompte();
    const erreur = await service.corriger('appr-1', 't-1').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ConflictException);
    expect((erreur as ConflictException).getResponse()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: MESSAGE_CORRECTION_NON_NOTEE,
      raison: 'non_notee',
      disponibleLe: null,
    });
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('409 correction_differee + disponibleLe en DIFFÉRÉ avant la fermeture', async () => {
    tentativeRepository.findOne.mockResolvedValue(
      tentative({}, { affichageResultats: AffichageResultats.DIFFERE }),
    );
    horlogeEtCompte();
    const erreur = (await service.corriger('appr-1', 't-1').catch((e: unknown) => e)) as
      | ConflictException
      | undefined;
    expect(erreur?.getResponse()).toMatchObject({
      message: MESSAGE_CORRECTION_DIFFEREE,
      raison: 'correction_differee',
      disponibleLe: FERMETURE,
    });
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('409 tentatives_restantes en IMMÉDIAT quand une autre tentative reste possible (D4-B)', async () => {
    tentativeRepository.findOne.mockResolvedValue(tentative({}, { nbTentativesMax: 2 }));
    horlogeEtCompte(1, 0);
    await expect(service.corriger('appr-1', 't-1')).rejects.toMatchObject({
      response: { raison: 'tentatives_restantes', disponibleLe: FERMETURE },
    });
  });

  it('tentative notée sans plan : corrigé vide, aucune lecture du contenu', async () => {
    tentativeRepository.findOne.mockResolvedValue(tentative({ planTirage: null }));
    horlogeEtCompte();
    const vue = await service.corriger('appr-1', 't-1');
    expect(vue.questions).toEqual([]);
    expect(vue.nbQuestions).toBe(0);
    expect(manager.find).not.toHaveBeenCalled();
  });

  it('etat : expose mode / disponible / raison / disponibleLe, sans réponse', async () => {
    dataSource.query.mockResolvedValueOnce([{ passees: 1, enCours: 0 }]);
    const etat = await service.etat(
      { apprenantId: 'appr-1', qcmId: 'qcm-1', statut: StatutTentative.NOTEE },
      {
        affichageResultats: AffichageResultats.DIFFERE,
        dateFermeture: FERMETURE,
        nbTentativesMax: 1,
      },
      MAINTENANT,
    );
    expect(etat).toEqual({
      mode: AffichageResultats.DIFFERE,
      disponible: false,
      raison: 'correction_differee',
      disponibleLe: FERMETURE,
    });
  });
});

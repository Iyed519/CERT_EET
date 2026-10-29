import { EntityManager } from 'typeorm';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Question } from '../../database/entities/question.entity';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { TentativeTirageService } from './tentative-tirage.service';

/**
 * Tests unitaires du service de tirage (US-QCM-06) : les requêtes ne
 * demandent jamais `estCorrecte`, et la vue apprenant est une liste blanche
 * — même si la base renvoyait trop de champs, ils ne sortiraient pas.
 */
describe('TentativeTirageService', () => {
  let service: TentativeTirageService;
  let manager: { find: jest.Mock };

  beforeEach(() => {
    service = new TentativeTirageService();
    manager = { find: jest.fn() };
  });

  it('tirer : lit les questions du QCM sans jamais demander estCorrecte', async () => {
    manager.find.mockResolvedValue([
      {
        id: 'l2',
        ordre: 2,
        questionId: 'q2',
        question: { id: 'q2', type: TypeQuestion.QCU, options: [{ id: 'b', ordre: 1 }] },
      },
      {
        id: 'l1',
        ordre: 1,
        questionId: 'q1',
        question: {
          id: 'q1',
          type: TypeQuestion.QCM,
          options: [
            { id: 'y', ordre: 2 },
            { id: 'x', ordre: 1 },
          ],
        },
      },
    ]);

    const plan = await service.tirer(manager as unknown as EntityManager, 'qcm-1', {
      randomiserQuestions: false,
      randomiserOptions: false,
      nbQuestionsTirees: null,
    });

    expect(plan).toEqual([
      { questionId: 'q1', optionIds: ['x', 'y'] },
      { questionId: 'q2', optionIds: ['b'] },
    ]);
    const [entite, options] = manager.find.mock.calls[0];
    expect(entite).toBe(QcmQuestion);
    expect(options.where).toEqual({ qcmId: 'qcm-1' });
    expect(JSON.stringify(options.select)).not.toMatch(/estCorrecte|explication/);
  });

  it('presenter : ordre du plan, options dans l’ordre tiré, liste blanche stricte', async () => {
    // La base renvoie trop de champs (estCorrecte, explication, pondération) : ils ne sortent pas.
    manager.find.mockResolvedValue([
      {
        id: 'q1',
        enonce: 'Combien ?',
        type: TypeQuestion.QCU,
        explication: 'SECRET',
        ponderation: 3,
        options: [
          { id: 'a', texte: 'Un', estCorrecte: true },
          { id: 'b', texte: 'Deux', estCorrecte: false },
        ],
      },
      {
        id: 'q2',
        enonce: 'Vrai ?',
        type: TypeQuestion.VRAI_FAUX,
        options: [
          { id: 'v', texte: 'Vrai', estCorrecte: false },
          { id: 'f', texte: 'Faux', estCorrecte: true },
        ],
      },
    ]);

    const questions = await service.presenter(manager as unknown as EntityManager, [
      { questionId: 'q2', optionIds: ['v', 'f'] },
      { questionId: 'q1', optionIds: ['b', 'a'] },
    ]);

    expect(questions).toEqual([
      {
        id: 'q2',
        enonce: 'Vrai ?',
        type: TypeQuestion.VRAI_FAUX,
        options: [
          { id: 'v', texte: 'Vrai' },
          { id: 'f', texte: 'Faux' },
        ],
      },
      {
        id: 'q1',
        enonce: 'Combien ?',
        type: TypeQuestion.QCU,
        options: [
          { id: 'b', texte: 'Deux' },
          { id: 'a', texte: 'Un' },
        ],
      },
    ]);
    expect(JSON.stringify(questions)).not.toMatch(/estCorrecte|SECRET|ponderation/);
    const [entite, options] = manager.find.mock.calls[0];
    expect(entite).toBe(Question);
    expect(JSON.stringify(options.select)).not.toMatch(/estCorrecte|explication|ponderation/);
  });

  it('presenter : ignore une question ou une option disparue ; plan vide sans requête', async () => {
    manager.find.mockResolvedValue([
      { id: 'q1', enonce: 'E', type: TypeQuestion.QCU, options: [{ id: 'a', texte: 'A' }] },
    ]);
    const questions = await service.presenter(manager as unknown as EntityManager, [
      { questionId: 'q1', optionIds: ['a', 'disparue'] },
      { questionId: 'q-disparue', optionIds: ['z'] },
    ]);
    expect(questions).toEqual([
      { id: 'q1', enonce: 'E', type: TypeQuestion.QCU, options: [{ id: 'a', texte: 'A' }] },
    ]);

    manager.find.mockClear();
    await expect(service.presenter(manager as unknown as EntityManager, [])).resolves.toEqual([]);
    expect(manager.find).not.toHaveBeenCalled();
  });
});

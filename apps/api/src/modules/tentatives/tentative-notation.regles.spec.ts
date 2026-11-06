import {
  arrondir2,
  estReponseCorrecte,
  estReussie,
  noterTentative,
  tauxAvancement,
} from './tentative-notation.regles';

/**
 * Tests unitaires des règles pures de notation (US-QCM-08) : correction tout
 * ou rien (D3), score pondéré sur les questions du tirage avec les questions
 * sans réponse à 0 (D4), arrondi et seuil (D5), taux d'avancement (D9).
 */
describe('Règles de notation', () => {
  const ens = (...ids: string[]): Set<string> => new Set(ids);

  describe('estReponseCorrecte — tout ou rien', () => {
    it.each([
      ['QCU : la bonne option', ['a'], ['a'], true],
      ['QCU : une autre option', ['b'], ['a'], false],
      ['QCM : exactement les bonnes', ['b', 'a'], ['a', 'b'], true],
      ['QCM : une bonne manquante', ['a'], ['a', 'b'], false],
      ['QCM : une option en trop', ['a', 'b', 'c'], ['a', 'b'], false],
      ['rien de coché', [], ['a'], false],
      ['rien de coché, aucune bonne', [], [], false],
    ])('%s', (_cas, cochees, correctes, attendu) => {
      expect(estReponseCorrecte(ens(...cochees), ens(...correctes))).toBe(attendu);
    });
  });

  describe('noterTentative', () => {
    // Pondérations 1, 2, 3, 4 (total 10).
    const QUESTIONS = [
      { questionId: 'q1', ponderation: 1, correctes: ens('a') },
      { questionId: 'q2', ponderation: 2, correctes: ens('a', 'b') },
      { questionId: 'q3', ponderation: 3, correctes: ens('v') },
      { questionId: 'q4', ponderation: 4, correctes: ens('x') },
    ];

    it('score = Σ(pondération × correcte) / Σ(pondération) × 100 ; sans réponse = 0', () => {
      const notation = noterTentative(
        QUESTIONS,
        new Map([
          ['q1', ens('a')], // correcte : 1
          ['q2', ens('a')], // incomplète : 0
          ['q3', ens('v')], // correcte : 3
          // q4 sans réponse : 0, mais compte au dénominateur
        ]),
      );
      expect(notation.score).toBe(40);
      expect(notation).toMatchObject({ nbQuestions: 4, nbCorrectes: 2 });
      expect(notation.questions).toEqual([
        { questionId: 'q1', repondue: true, estCorrecte: true, pointsObtenus: 1 },
        { questionId: 'q2', repondue: true, estCorrecte: false, pointsObtenus: 0 },
        { questionId: 'q3', repondue: true, estCorrecte: true, pointsObtenus: 3 },
        { questionId: 'q4', repondue: false, estCorrecte: false, pointsObtenus: 0 },
      ]);
    });

    it('tout juste : 100 ; rien de répondu : 0', () => {
      const toutJuste = new Map(QUESTIONS.map((q) => [q.questionId, new Set(q.correctes)]));
      expect(noterTentative(QUESTIONS, toutJuste).score).toBe(100);
      expect(noterTentative(QUESTIONS, new Map()).score).toBe(0);
    });

    it('une réponse à une question HORS tirage est ignorée', () => {
      const notation = noterTentative(QUESTIONS.slice(0, 1), new Map([['q9', ens('z')]]));
      expect(notation).toMatchObject({ score: 0, nbQuestions: 1, nbCorrectes: 0 });
    });

    it('arrondi à 2 décimales (1/3 -> 33,33)', () => {
      const trois = [1, 2, 3].map((i) => ({
        questionId: `q${i}`,
        ponderation: 1,
        correctes: ens('a'),
      }));
      expect(noterTentative(trois, new Map([['q1', ens('a')]])).score).toBe(33.33);
      expect(
        noterTentative(
          trois,
          new Map([
            ['q1', ens('a')],
            ['q2', ens('a')],
          ]),
        ).score,
      ).toBe(66.67);
    });

    it('sans question (impossible après publication) : 0, sans division par zéro', () => {
      expect(noterTentative([], new Map()).score).toBe(0);
    });
  });

  it('arrondir2 évite les erreurs de flottant', () => {
    expect(arrondir2(1.005)).toBe(1.01);
    expect(arrondir2(66.666666)).toBe(66.67);
  });

  it('estReussie : le seuil est atteint dès l’égalité', () => {
    expect(estReussie(60, 60)).toBe(true);
    expect(estReussie(59.99, 60)).toBe(false);
    expect(estReussie(0, 0)).toBe(true);
  });

  it('tauxAvancement : QCM réussis / QCM publiés, borné, 0 sans QCM', () => {
    expect(tauxAvancement(1, 2)).toBe(50);
    expect(tauxAvancement(1, 3)).toBe(33.33);
    expect(tauxAvancement(3, 3)).toBe(100);
    expect(tauxAvancement(4, 3)).toBe(100);
    expect(tauxAvancement(0, 0)).toBe(0);
  });
});

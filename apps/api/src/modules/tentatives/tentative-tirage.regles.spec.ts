import { TypeQuestion } from '../../database/enums/type-question.enum';
import {
  Aleatoire,
  QuestionATirer,
  aleatoireCrypto,
  melanger,
  tirerPlan,
} from './tentative-tirage.regles';

/**
 * Tests unitaires du tirage (US-QCM-06) : Fisher-Yates exact avec un hasard
 * imposé, uniformité avec le vrai générateur cryptographique, tirage de K
 * parmi N, ordre de rédaction conservé quand le mélange est désactivé,
 * Vrai/Faux jamais mélangé.
 */
describe('Tirage d’une tentative', () => {
  /** Hasard rejoué depuis une liste : rend les tests exacts. */
  const sequence = (valeurs: number[]): Aleatoire => {
    let i = 0;
    return (max) => {
      const v = valeurs[i++ % valeurs.length];
      if (v >= max) throw new Error(`valeur ${v} hors de [0, ${max})`);
      return v;
    };
  };
  /** Le hasard qui ne déplace rien : j = i à chaque étape. */
  const identite: Aleatoire = (max) => max - 1;

  const question = (n: number, type = TypeQuestion.QCU): QuestionATirer => ({
    questionId: `q${n}`,
    ordre: n,
    type,
    options: [
      { id: `q${n}-o2`, ordre: 2 },
      { id: `q${n}-o1`, ordre: 1 },
      { id: `q${n}-o3`, ordre: 3 },
    ],
  });
  // Fournies dans le désordre : le tirage repart toujours de l'ordre de rédaction.
  const QUESTIONS = [question(3), question(1), question(4), question(2)];
  const sansAlea = {
    randomiserQuestions: false,
    randomiserOptions: false,
    nbQuestionsTirees: null,
  };

  describe('melanger (Fisher-Yates)', () => {
    it('applique exactement les échanges demandés, sans modifier l’entrée', () => {
      const entree = ['a', 'b', 'c', 'd'];
      // i=3 ↔ 0, i=2 ↔ 2, i=1 ↔ 0
      expect(melanger(entree, sequence([0, 2, 0]))).toEqual(['b', 'd', 'c', 'a']);
      expect(entree).toEqual(['a', 'b', 'c', 'd']);
    });

    it('avec crypto : les 6 permutations de 3 éléments sont équiprobables', () => {
      const comptes = new Map<string, number>();
      const tours = 6000;
      for (let n = 0; n < tours; n++) {
        const cle = melanger(['a', 'b', 'c'], aleatoireCrypto).join('');
        comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
      }
      expect(comptes.size).toBe(6);
      // Attendu 1000 chacune ; ± 15 % laisse une marge de plus de 5 écarts-types.
      for (const nb of comptes.values()) {
        expect(nb).toBeGreaterThan(850);
        expect(nb).toBeLessThan(1150);
      }
    });

    it('liste vide ou à un élément : inchangée', () => {
      expect(melanger([], aleatoireCrypto)).toEqual([]);
      expect(melanger(['x'], aleatoireCrypto)).toEqual(['x']);
    });
  });

  describe('tirerPlan', () => {
    it('sans mélange ni tirage : ordre de rédaction des questions et des options', () => {
      expect(tirerPlan(QUESTIONS, sansAlea, aleatoireCrypto)).toEqual([
        { questionId: 'q1', optionIds: ['q1-o1', 'q1-o2', 'q1-o3'] },
        { questionId: 'q2', optionIds: ['q2-o1', 'q2-o2', 'q2-o3'] },
        { questionId: 'q3', optionIds: ['q3-o1', 'q3-o2', 'q3-o3'] },
        { questionId: 'q4', optionIds: ['q4-o1', 'q4-o2', 'q4-o3'] },
      ]);
    });

    it('mélange des questions : l’ordre suit le hasard', () => {
      const plan = tirerPlan(
        QUESTIONS,
        { ...sansAlea, randomiserQuestions: true },
        sequence([0, 2, 0]),
      );
      expect(plan.map((q) => q.questionId)).toEqual(['q2', 'q4', 'q3', 'q1']);
    });

    it('tirage de K parmi N SANS mélange : K questions au hasard, en ordre de rédaction', () => {
      // Mélange q1..q4 -> q2, q4, q3, q1 ; on garde 2 (q2, q4), remis dans l'ordre.
      const plan = tirerPlan(QUESTIONS, { ...sansAlea, nbQuestionsTirees: 2 }, sequence([0, 2, 0]));
      expect(plan.map((q) => q.questionId)).toEqual(['q2', 'q4']);
    });

    it('tirage de K parmi N AVEC mélange : K questions, dans l’ordre tiré', () => {
      const plan = tirerPlan(
        QUESTIONS,
        { ...sansAlea, randomiserQuestions: true, nbQuestionsTirees: 2 },
        sequence([0, 2, 0]),
      );
      expect(plan.map((q) => q.questionId)).toEqual(['q2', 'q4']);
      const autre = tirerPlan(
        QUESTIONS,
        { ...sansAlea, randomiserQuestions: true, nbQuestionsTirees: 2 },
        sequence([3, 0, 1]),
      );
      // i=3 ↔ 3, i=2 ↔ 0, i=1 ↔ 1 : q3, q2, q1, q4 -> on garde q3, q2.
      expect(autre.map((q) => q.questionId)).toEqual(['q3', 'q2']);
    });

    it('K plafonné au nombre de questions ; K = N revient à tout prendre', () => {
      expect(tirerPlan(QUESTIONS, { ...sansAlea, nbQuestionsTirees: 10 }, identite)).toHaveLength(
        4,
      );
      expect(
        tirerPlan(QUESTIONS, { ...sansAlea, nbQuestionsTirees: 4 }, identite).map(
          (q) => q.questionId,
        ),
      ).toEqual(['q1', 'q2', 'q3', 'q4']);
    });

    it('mélange des options, sauf pour un Vrai/Faux', () => {
      const vf: QuestionATirer = {
        questionId: 'vf',
        ordre: 5,
        type: TypeQuestion.VRAI_FAUX,
        options: [
          { id: 'faux', ordre: 2 },
          { id: 'vrai', ordre: 1 },
        ],
      };
      const plan = tirerPlan(
        [question(1), vf],
        { ...sansAlea, randomiserOptions: true },
        sequence([0, 0]),
      );
      // QCU mélangée : o1,o2,o3 -> i=2 ↔ 0 -> o3,o2,o1 -> i=1 ↔ 0 -> o2,o3,o1.
      expect(plan[0].optionIds).toEqual(['q1-o2', 'q1-o3', 'q1-o1']);
      expect(plan[1].optionIds).toEqual(['vrai', 'faux']);
    });

    it('chaque question tirée est unique et appartient au QCM', () => {
      for (let n = 0; n < 200; n++) {
        const plan = tirerPlan(
          QUESTIONS,
          { randomiserQuestions: true, randomiserOptions: true, nbQuestionsTirees: 3 },
          aleatoireCrypto,
        );
        const ids = plan.map((q) => q.questionId);
        expect(new Set(ids).size).toBe(3);
        expect(ids.every((id) => ['q1', 'q2', 'q3', 'q4'].includes(id))).toBe(true);
        for (const q of plan) {
          expect([...q.optionIds].sort()).toEqual([
            `${q.questionId}-o1`,
            `${q.questionId}-o2`,
            `${q.questionId}-o3`,
          ]);
        }
      }
    });

    it('QCM sans question : plan vide', () => {
      expect(tirerPlan([], { ...sansAlea, nbQuestionsTirees: 3 }, aleatoireCrypto)).toEqual([]);
    });
  });
});

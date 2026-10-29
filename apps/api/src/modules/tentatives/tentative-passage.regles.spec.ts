import { TypeQuestion } from '../../database/enums/type-question.enum';
import {
  MESSAGE_OPTION_HORS_QUESTION,
  MESSAGE_TYPE_NON_PRIS_EN_CHARGE,
  MESSAGE_UNE_SEULE_OPTION,
  cleMinuterie,
  dureeEffectiveSecondes,
  estEchue,
  ordonnerSelonTirage,
  trouverQuestionTiree,
  verifierOptions,
} from './tentative-passage.regles';

/**
 * Tests unitaires des règles pures du passage (US-QCM-07) : question du
 * tirage, options autorisées, une seule option pour QCU / Vrai-Faux, types
 * non pris en charge, échéance, durée effective, clé Redis.
 */
describe('Règles du passage d’une tentative', () => {
  const PLAN = [
    { questionId: 'q1', optionIds: ['c', 'a', 'b'] },
    { questionId: 'q2', optionIds: ['v', 'f'] },
  ];

  describe('trouverQuestionTiree', () => {
    it('trouve une question du tirage', () => {
      expect(trouverQuestionTiree(PLAN, 'q2')).toEqual(PLAN[1]);
    });

    it('refuse une question hors tirage, ou une tentative sans plan', () => {
      expect(trouverQuestionTiree(PLAN, 'q3')).toBeNull();
      expect(trouverQuestionTiree(null, 'q1')).toBeNull();
    });
  });

  describe('verifierOptions', () => {
    it.each([
      [TypeQuestion.QCM, ['a', 'b', 'c']],
      [TypeQuestion.QCM, ['b']],
      [TypeQuestion.QCU, ['a']],
      [TypeQuestion.QCU, []],
      [TypeQuestion.VRAI_FAUX, []],
    ])('accepte %s avec %j', (type, options) => {
      const tiree = type === TypeQuestion.VRAI_FAUX ? PLAN[1] : PLAN[0];
      expect(verifierOptions(tiree, type, options)).toBeNull();
    });

    it('refuse une option qui n’est pas dans le tirage de la question', () => {
      expect(verifierOptions(PLAN[0], TypeQuestion.QCM, ['a', 'v'])).toEqual({
        raison: 'option_hors_question',
        message: MESSAGE_OPTION_HORS_QUESTION,
      });
    });

    it.each([TypeQuestion.QCU, TypeQuestion.VRAI_FAUX])(
      'refuse deux options pour un %s',
      (type) => {
        const tiree = type === TypeQuestion.VRAI_FAUX ? PLAN[1] : PLAN[0];
        expect(verifierOptions(tiree, type, tiree.optionIds.slice(0, 2))).toEqual({
          raison: 'une_seule_option',
          message: MESSAGE_UNE_SEULE_OPTION,
        });
      },
    );

    it('vérifie l’appartenance avant le nombre d’options', () => {
      expect(verifierOptions(PLAN[0], TypeQuestion.QCU, ['a', 'zz'])?.raison).toBe(
        'option_hors_question',
      );
    });

    it.each([TypeQuestion.REPONSE_COURTE, TypeQuestion.ASSOCIATION])(
      'refuse le type %s, même avec une liste vide (D14)',
      (type) => {
        expect(verifierOptions(PLAN[0], type, [])).toEqual({
          raison: 'type_non_pris_en_charge',
          message: MESSAGE_TYPE_NON_PRIS_EN_CHARGE,
        });
      },
    );
  });

  it('ordonnerSelonTirage range les options dans l’ordre vu par l’apprenant', () => {
    expect(ordonnerSelonTirage(PLAN[0], ['b', 'c'])).toEqual(['c', 'b']);
    expect(ordonnerSelonTirage(PLAN[0], [])).toEqual([]);
  });

  describe('estEchue — l’instant de l’échéance est déjà hors temps', () => {
    const LIMITE = new Date('2026-11-02T10:30:00Z');

    it('avant l’échéance : non', () => {
      expect(estEchue(LIMITE, new Date(LIMITE.getTime() - 1))).toBe(false);
    });

    it('à l’échéance exacte et après : oui', () => {
      expect(estEchue(LIMITE, LIMITE)).toBe(true);
      expect(estEchue(LIMITE, new Date(LIMITE.getTime() + 1))).toBe(true);
    });
  });

  it('dureeEffectiveSecondes arrondit à la seconde et n’est jamais négative', () => {
    const debut = new Date('2026-11-02T10:00:00.000Z');
    expect(dureeEffectiveSecondes(debut, new Date('2026-11-02T10:30:00.000Z'))).toBe(1800);
    expect(dureeEffectiveSecondes(debut, new Date('2026-11-02T10:00:01.600Z'))).toBe(2);
    expect(dureeEffectiveSecondes(debut, new Date('2026-11-02T09:59:00.000Z'))).toBe(0);
  });

  it('cleMinuterie suit DS-02 : timer:{tentativeId}', () => {
    expect(cleMinuterie('t-1')).toBe('timer:t-1');
  });
});

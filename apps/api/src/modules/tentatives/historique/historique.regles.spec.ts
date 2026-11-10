import { resultatVisible, selectionsDansLOrdre } from './historique.regles';

describe('Historique des tentatives — règles (US-QCM-11)', () => {
  it('selectionsDansLOrdre : ordre du tirage, questions du plan seulement, vides omises', () => {
    const plan = [
      { questionId: 'q1', optionIds: ['c', 'a', 'b'] },
      { questionId: 'q2', optionIds: ['x', 'y'] },
      { questionId: 'q3', optionIds: ['m', 'n'] },
    ];
    const cochees = new Map([
      ['q1', new Set(['a', 'c'])],
      ['q2', new Set<string>()],
      ['hors-plan', new Set(['z'])],
    ]);
    expect(selectionsDansLOrdre(plan, cochees)).toEqual({ q1: ['c', 'a'] });
  });

  it('resultatVisible : seulement sur une tentative NOTEE', () => {
    expect(resultatVisible('NOTEE', 72.5)).toBe(72.5);
    expect(resultatVisible('SOUMISE', 72.5)).toBeNull();
    expect(resultatVisible('EN_COURS', true)).toBeNull();
    expect(resultatVisible('NOTEE', null)).toBeNull();
  });
});

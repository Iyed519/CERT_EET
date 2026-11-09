import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { QuestionValidee } from '../../qcm/qcm.service';
import { estModifiee, nettoyerMotif, questionProposee } from './revision.regles';

/** Règles pures de la révision humaine (US-IA-04). */
describe('revision.regles (US-IA-04)', () => {
  const base: QuestionValidee = {
    enonce: 'Quel algorithme signe un JWT ?',
    type: TypeQuestion.QCU,
    ponderation: 1,
    explication: 'Passage 2.',
    niveauDifficulte: 'AVANCE',
    options: [
      { texte: 'RS256', estCorrecte: true },
      { texte: 'MD5', estCorrecte: false },
    ],
  };

  it('questionProposee : contenu de l’IA, niveau de la génération, sans pondération imposée', () => {
    expect(
      questionProposee(
        {
          enonce: 'Quel algorithme signe un JWT ?',
          type: 'QCU',
          options: [
            { texte: 'RS256', estCorrecte: true },
            { texte: 'MD5', estCorrecte: false },
          ],
          explication: null,
        },
        'AVANCE',
      ),
    ).toEqual({
      enonce: 'Quel algorithme signe un JWT ?',
      type: TypeQuestion.QCU,
      explication: undefined,
      niveauDifficulte: 'AVANCE',
      options: [
        { texte: 'RS256', estCorrecte: true },
        { texte: 'MD5', estCorrecte: false },
      ],
    });
  });

  it('estModifiee : identique -> non', () => {
    expect(estModifiee(base, { ...base, options: base.options.map((o) => ({ ...o })) })).toBe(
      false,
    );
  });

  it.each<[string, Partial<QuestionValidee>]>([
    ['énoncé', { enonce: 'Quel algorithme chiffre un JWT ?' }],
    ['type', { type: TypeQuestion.QCM }],
    ['pondération', { ponderation: 2 }],
    ['explication', { explication: null }],
    ['niveau', { niveauDifficulte: 'DEBUTANT' }],
    ['nombre d’options', { options: [...base.options, { texte: 'HS256', estCorrecte: false }] }],
    [
      'texte d’une option',
      {
        options: [
          { texte: 'RS512', estCorrecte: true },
          { texte: 'MD5', estCorrecte: false },
        ],
      },
    ],
    [
      'bonne réponse',
      {
        options: [
          { texte: 'RS256', estCorrecte: false },
          { texte: 'MD5', estCorrecte: true },
        ],
      },
    ],
  ])('estModifiee : %s changé -> oui', (_cas, surcharge) => {
    expect(estModifiee(base, { ...base, ...surcharge })).toBe(true);
  });

  it('nettoyerMotif : espaces réduits, vide -> null', () => {
    expect(nettoyerMotif('  hors   sujet ')).toBe('hors sujet');
    expect(nettoyerMotif('   ')).toBeNull();
    expect(nettoyerMotif(undefined)).toBeNull();
    expect(nettoyerMotif(null)).toBeNull();
  });
});

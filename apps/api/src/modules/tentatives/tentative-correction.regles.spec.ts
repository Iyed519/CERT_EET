import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import {
  ContexteCorrection,
  construireCorrection,
  evaluerCorrection,
  MESSAGE_CORRECTION_DIFFEREE,
  MESSAGE_CORRECTION_NON_NOTEE,
  MESSAGE_CORRECTION_TENTATIVES_RESTANTES,
  messageCorrection,
  QuestionACorriger,
  ReponseNotee,
} from './tentative-correction.regles';

/**
 * Tests unitaires des règles du corrigé (US-QCM-09) : disponibilité selon le
 * mode, l'horloge de la base et les tentatives restantes (D2, D3, D4 option
 * B) ; contenu en liste blanche, dans l'ordre du tirage, juste / faux tel que
 * noté (D6). Dates fixes comparées entre elles, jamais à l'horloge réelle.
 */
describe('Règles du corrigé (US-QCM-09)', () => {
  const FERMETURE = new Date('2026-11-10T18:00:00Z');
  const AVANT = new Date('2026-11-10T17:59:59Z');

  const contexte = (surcharge: Partial<ContexteCorrection> = {}): ContexteCorrection => ({
    statut: StatutTentative.NOTEE,
    mode: AffichageResultats.IMMEDIAT,
    maintenant: AVANT,
    dateFermeture: FERMETURE,
    nbTentativesMax: 1,
    nbTentativesPassees: 1,
    tentativeEnCours: false,
    ...surcharge,
  });

  describe('evaluerCorrection', () => {
    it.each([StatutTentative.EN_COURS, StatutTentative.SOUMISE, StatutTentative.ABANDONNEE_TIMER])(
      'tentative %s (non notée) : non_notee, sans date — même fenêtre fermée',
      (statut) => {
        expect(evaluerCorrection(contexte({ statut, maintenant: FERMETURE }))).toEqual({
          mode: AffichageResultats.IMMEDIAT,
          disponible: false,
          raison: 'non_notee',
          disponibleLe: null,
        });
      },
    );

    it('IMMÉDIAT, tentative unique terminée : disponible tout de suite (Backlog, nominal)', () => {
      expect(evaluerCorrection(contexte())).toEqual({
        mode: AffichageResultats.IMMEDIAT,
        disponible: true,
        raison: null,
        disponibleLe: null,
      });
    });

    it('IMMÉDIAT, tentatives restantes : tentatives_restantes, disponible à la fermeture (D4-B)', () => {
      expect(evaluerCorrection(contexte({ nbTentativesMax: 3, nbTentativesPassees: 1 }))).toEqual({
        mode: AffichageResultats.IMMEDIAT,
        disponible: false,
        raison: 'tentatives_restantes',
        disponibleLe: FERMETURE,
      });
    });

    it('IMMÉDIAT, quota atteint mais une tentative encore EN_COURS : toujours refusé', () => {
      const etat = evaluerCorrection(
        contexte({ nbTentativesMax: 2, nbTentativesPassees: 2, tentativeEnCours: true }),
      );
      expect(etat.disponible).toBe(false);
      expect(etat.raison).toBe('tentatives_restantes');
    });

    it('IMMÉDIAT, quota atteint, aucune EN_COURS : disponible', () => {
      expect(
        evaluerCorrection(contexte({ nbTentativesMax: 2, nbTentativesPassees: 2 })).disponible,
      ).toBe(true);
    });

    it('DIFFÉRÉ avant la fermeture : correction_differee, disponibleLe = fermeture', () => {
      expect(evaluerCorrection(contexte({ mode: AffichageResultats.DIFFERE }))).toEqual({
        mode: AffichageResultats.DIFFERE,
        disponible: false,
        raison: 'correction_differee',
        disponibleLe: FERMETURE,
      });
    });

    it('DIFFÉRÉ à la seconde même de la fermeture : disponible (maintenant >= fermeture)', () => {
      expect(
        evaluerCorrection(contexte({ mode: AffichageResultats.DIFFERE, maintenant: FERMETURE }))
          .disponible,
      ).toBe(true);
    });

    it('fenêtre fermée : disponible en IMMÉDIAT même avec des tentatives restantes', () => {
      expect(
        evaluerCorrection(
          contexte({ maintenant: FERMETURE, nbTentativesMax: 5, nbTentativesPassees: 1 }),
        ).disponible,
      ).toBe(true);
    });

    it('accepte des dates sérialisées (chaînes ISO) venant de la base', () => {
      const etat = evaluerCorrection(
        contexte({
          mode: AffichageResultats.DIFFERE,
          maintenant: '2026-11-10T18:00:01Z' as unknown as Date,
          dateFermeture: '2026-11-10T18:00:00Z' as unknown as Date,
        }),
      );
      expect(etat.disponible).toBe(true);
    });
  });

  it('messageCorrection : un message par motif', () => {
    expect(messageCorrection('non_notee')).toBe(MESSAGE_CORRECTION_NON_NOTEE);
    expect(messageCorrection('correction_differee')).toBe(MESSAGE_CORRECTION_DIFFEREE);
    expect(messageCorrection('tentatives_restantes')).toBe(MESSAGE_CORRECTION_TENTATIVES_RESTANTES);
  });

  describe('construireCorrection', () => {
    const questions: QuestionACorriger[] = [
      {
        id: 'q1',
        enonce: 'Port HTTP ?',
        type: TypeQuestion.QCU,
        ponderation: 1,
        explication: 'Port 80 par défaut.',
        options: [
          { id: 'a', texte: '80' },
          { id: 'b', texte: '443' },
        ],
      },
      {
        id: 'q2',
        enonce: 'Commandes Git ?',
        type: TypeQuestion.QCM,
        ponderation: 2,
        explication: null,
        options: [
          { id: 'c', texte: 'commit' },
          { id: 'd', texte: 'push' },
          { id: 'e', texte: 'paint' },
        ],
      },
      {
        id: 'q3',
        enonce: 'Docker est une VM ?',
        type: TypeQuestion.VRAI_FAUX,
        ponderation: 3,
        explication: 'Un conteneur partage le noyau.',
        options: [
          { id: 'v', texte: 'Vrai' },
          { id: 'f', texte: 'Faux' },
        ],
      },
    ];
    const correctes = new Set(['a', 'c', 'd', 'f']);
    // Plan : q3 puis q1 (q2 non tirée) ; options de q1 dans l'ordre tiré b, a.
    const plan = [
      { questionId: 'q3', optionIds: ['v', 'f'] },
      { questionId: 'q1', optionIds: ['b', 'a'] },
    ];

    it('suit l’ordre du tirage, ignore les questions non tirées, réponse notée telle quelle', () => {
      const reponses = new Map<string, ReponseNotee>([
        ['q1', { estCorrecte: true, pointsObtenus: 1, optionIds: ['a'] }],
        ['q2', { estCorrecte: true, pointsObtenus: 2, optionIds: ['c', 'd'] }],
      ]);
      const corrige = construireCorrection(plan, questions, correctes, reponses);
      expect(corrige.map((q) => q.id)).toEqual(['q3', 'q1']);
      expect(corrige[1]).toEqual({
        id: 'q1',
        enonce: 'Port HTTP ?',
        type: TypeQuestion.QCU,
        ponderation: 1,
        repondue: true,
        estCorrecte: true,
        pointsObtenus: 1,
        explication: 'Port 80 par défaut.',
        options: [
          { id: 'b', texte: '443', cochee: false, estCorrecte: false },
          { id: 'a', texte: '80', cochee: true, estCorrecte: true },
        ],
      });
    });

    it('question sans réponse : repondue false, faux, 0 point, bonnes options montrées', () => {
      const corrige = construireCorrection(plan, questions, correctes, new Map());
      expect(corrige[0]).toMatchObject({
        id: 'q3',
        repondue: false,
        estCorrecte: false,
        pointsObtenus: 0,
        explication: 'Un conteneur partage le noyau.',
      });
      expect(corrige[0].options).toEqual([
        { id: 'v', texte: 'Vrai', cochee: false, estCorrecte: false },
        { id: 'f', texte: 'Faux', cochee: false, estCorrecte: true },
      ]);
    });

    it('juste / faux : ce que la notation a écrit, jamais recalculé (D6)', () => {
      // Réponse cochée juste, mais notée fausse : le corrigé montre ce qui a été NOTÉ.
      const reponses = new Map<string, ReponseNotee>([
        ['q1', { estCorrecte: false, pointsObtenus: 0, optionIds: ['a'] }],
      ]);
      const [, q1] = construireCorrection(plan, questions, correctes, reponses);
      expect(q1.estCorrecte).toBe(false);
      expect(q1.pointsObtenus).toBe(0);
    });

    it('liste blanche : aucun champ en plus (ni niveau, ni ordre, ni identifiants internes)', () => {
      const [q3] = construireCorrection(plan, questions, correctes, new Map());
      expect(Object.keys(q3).sort()).toEqual(
        [
          'enonce',
          'estCorrecte',
          'explication',
          'id',
          'options',
          'ponderation',
          'pointsObtenus',
          'repondue',
          'type',
        ].sort(),
      );
      expect(Object.keys(q3.options[0]).sort()).toEqual(['cochee', 'estCorrecte', 'id', 'texte']);
    });

    it('question ou option disparue du contenu : ignorée sans casser le corrigé', () => {
      const corrige = construireCorrection(
        [
          { questionId: 'q-disparue', optionIds: ['x'] },
          { questionId: 'q1', optionIds: ['b', 'a', 'o-disparue'] },
        ],
        questions,
        correctes,
        new Map(),
      );
      expect(corrige.map((q) => q.id)).toEqual(['q1']);
      expect(corrige[0].options.map((o) => o.id)).toEqual(['b', 'a']);
    });

    it('plan vide : corrigé vide', () => {
      expect(construireCorrection([], questions, correctes, new Map())).toEqual([]);
    });
  });
});

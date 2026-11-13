import { ErreurLlm } from '../llm/fournisseur-llm';
import {
  construirePromptAnalyse,
  EntreeAnalyse,
  entreeAnalyseTentative,
  MESSAGE_ANALYSE_INEXPLOITABLE,
  requetePassages,
  validerAnalyse,
  verdictDe,
} from './analyse-points-faibles.regles';

describe('Analyse des points faibles — règles (US-IA-10)', () => {
  const LIGNES = [
    {
      rang: 1,
      enonce: 'Quel élément valide automatiquement le corps d’une requête ?',
      type: 'QCU',
      niveau: 'DEBUTANT',
      repondue: true,
      estCorrecte: false,
      optionsCochees: ['Un middleware CORS'],
      bonnesReponses: ['ValidationPipe'],
      explication: 'Le ValidationPipe applique class-validator.',
    },
    {
      rang: 2,
      enonce: 'Un service est injecté par le constructeur.',
      type: 'VRAI_FAUX',
      niveau: null,
      repondue: true,
      estCorrecte: true,
      optionsCochees: ['Vrai'],
      bonnesReponses: ['Vrai'],
      explication: null,
    },
    {
      rang: 3,
      enonce: 'Quel décorateur déclare un contrôleur ?',
      type: 'QCU',
      niveau: null,
      repondue: false,
      estCorrecte: false,
      optionsCochees: [],
      bonnesReponses: ['@Controller()'],
      explication: 'Voir le chapitre 2.',
    },
  ];
  const tentative = (avecCorrige: boolean): Omit<EntreeAnalyse, 'passages'> =>
    entreeAnalyseTentative({
      formation: 'Full-stack',
      module: 'API REST',
      qcm: 'Les bases de NestJS',
      numero: 2,
      nbTentativesMax: 3,
      score: 33.333,
      scoreMinValidation: 60,
      estReussie: false,
      avecCorrige,
      lignes: LIGNES,
    });

  it('verdictDe : sans réponse, juste, faux', () => {
    expect(verdictDe({ repondue: false, estCorrecte: false })).toBe('SANS_REPONSE');
    expect(verdictDe({ repondue: true, estCorrecte: true })).toBe('JUSTE');
    expect(verdictDe({ repondue: true, estCorrecte: false })).toBe('FAUX');
  });

  it('entrée d’une tentative : contexte lisible, verdicts, aucune identité', () => {
    const e = tentative(true);
    expect(e.contexte).toBe(
      'QCM « Les bases de NestJS » (module « API REST »), tentative n° 2 sur 3 : score 33,33 / 100, seuil de validation 60 / 100 — échoué.',
    );
    expect(e.questions.map((q) => q.verdict)).toEqual(['FAUX', 'JUSTE', 'SANS_REPONSE']);
    expect(e.ateliers).toEqual([]);
    expect(JSON.stringify(e)).not.toMatch(/prenom|email|@example/);
  });

  it('sans corrigé : AUCUNE bonne réponse ni explication dans le prompt, consigne de ne rien révéler', () => {
    const p = construirePromptAnalyse({ ...tentative(false), passages: [] });
    expect(p.utilisateur).not.toContain('ValidationPipe');
    expect(p.utilisateur).not.toContain('@Controller()');
    expect(p.utilisateur).not.toContain('bonnesReponses');
    expect(p.utilisateur).not.toContain('explication');
    expect(p.systeme).toContain('Ne donne JAMAIS la bonne réponse');
    expect(p.utilisateur).toContain('Un middleware CORS');
    expect(p.utilisateur).toContain('"corrigeDisponible":false');
  });

  it('défense en profondeur : avecCorrige false -> bonnes réponses filtrées même si fournies', () => {
    const fuite = tentative(true);
    const p = construirePromptAnalyse({ ...fuite, avecCorrige: false, passages: [] });
    expect(p.utilisateur).not.toContain('ValidationPipe');
    expect(p.utilisateur).not.toContain('@Controller()');
    expect(p.utilisateur).not.toContain('Voir le chapitre 2.');
  });

  it('avec corrigé : bonnes réponses et explications envoyées, pas de consigne de secret', () => {
    const p = construirePromptAnalyse({ ...tentative(true), passages: [] });
    expect(p.utilisateur).toContain('ValidationPipe');
    expect(p.utilisateur).toContain('Voir le chapitre 2.');
    expect(p.systeme).not.toContain('Ne donne JAMAIS');
  });

  it('passages du cours joints (6 au plus), sinon mention explicite', () => {
    const passages = Array.from({ length: 8 }, (_, i) => ({
      support: 'Cours NestJS',
      texte: `Passage ${i + 1}`,
    }));
    const p = construirePromptAnalyse({ ...tentative(true), passages });
    expect(p.utilisateur).toContain('[6] Support « Cours NestJS »');
    expect(p.utilisateur).not.toContain('[7]');
    expect(construirePromptAnalyse({ ...tentative(true), passages: [] }).utilisateur).toContain(
      'Aucun support de cours indexé',
    );
  });

  it('requête RAG : les énoncés ratés, sinon tous', () => {
    expect(requetePassages(tentative(true).questions)).toBe(
      `${LIGNES[0].enonce}\n${LIGNES[2].enonce}`,
    );
    const toutJuste = tentative(true).questions.map((q) => ({ ...q, verdict: 'JUSTE' as const }));
    expect(requetePassages(toutJuste).split('\n')).toHaveLength(3);
  });

  describe('validerAnalyse', () => {
    const numeros = new Set([1, 2, 3]);
    const axe = (n: number): Record<string, unknown> => ({
      notion: `Notion ${n}`,
      constat: 'Constat.',
      conseil: 'Conseil.',
      questions: [3, 1, 1, 99, 1.5],
    });

    it('accepte, borne à 4 axes, filtre et trie les numéros de question', () => {
      const a = validerAnalyse(
        { synthese: ' Synthèse. ', axes: [1, 2, 3, 4, 5].map(axe), encouragement: 'Courage.' },
        numeros,
        'claude-sonnet-5-5',
      );
      expect(a.synthese).toBe('Synthèse.');
      expect(a.axes).toHaveLength(4);
      expect(a.axes[0].questions).toEqual([1, 3]);
      expect(a.modele).toBe('claude-sonnet-5-5');
    });

    it('ignore un axe incomplet ; encouragement absent -> chaîne vide', () => {
      const a = validerAnalyse(
        { synthese: 'S', axes: [{ notion: 'X', constat: '', conseil: 'C' }, axe(1)] },
        numeros,
        'm',
      );
      expect(a.axes.map((x) => x.notion)).toEqual(['Notion 1']);
      expect(a.encouragement).toBe('');
    });

    it('tronque les textes trop longs', () => {
      const a = validerAnalyse(
        { synthese: 'x'.repeat(5000), axes: [{ ...axe(1), notion: 'n'.repeat(500) }] },
        numeros,
        'm',
      );
      expect(a.synthese.length).toBe(700);
      expect(a.axes[0].notion.length).toBe(120);
    });

    it.each([null, {}, { synthese: 'S', axes: [] }, { axes: [axe(1)] }, 'texte'])(
      'inexploitable (%p) : erreur récupérable',
      (brut) => {
        let erreur: unknown;
        try {
          validerAnalyse(brut, numeros, 'm');
        } catch (e) {
          erreur = e;
        }
        expect(erreur).toBeInstanceOf(ErreurLlm);
        expect((erreur as ErreurLlm).message).toBe(MESSAGE_ANALYSE_INEXPLOITABLE);
        expect((erreur as ErreurLlm).recuperable).toBe(true);
      },
    );
  });
});

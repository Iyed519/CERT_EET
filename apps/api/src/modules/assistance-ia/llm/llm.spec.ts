import Anthropic from '@anthropic-ai/sdk';
import { construirePrompt, validerReponse } from '../generations/pipeline.regles';
import { ErreurLlm, OUTIL_QUESTIONS, PromptGeneration, SCHEMA_QUESTIONS } from './fournisseur-llm';
import { LlmAnthropic, traduireErreur } from './llm-anthropic';
import { LlmFactice, MODELE_FACTICE } from './llm-factice';
import { llmProvider } from './llm.provider';

/** Fournisseurs de LLM (US-IA-03) : factice, Anthropic (SDK simulé), fabrique. */
describe('Fournisseurs LLM (US-IA-03)', () => {
  const prompt = (
    focus: string | null,
    types: Array<'QCU' | 'QCM' | 'VRAI_FAUX'> = ['QCU'],
  ): PromptGeneration =>
    construirePrompt({
      passages: [
        {
          numero: 2,
          texte: 'Un jeton JWT est signé par le serveur. Il expire après quinze minutes.',
        },
        { numero: 5, texte: 'Le refresh token est renouvelé à chaque usage, une fois seulement.' },
      ],
      nbQuestions: 4,
      types,
      niveau: 'INTERMEDIAIRE',
      focus,
      titreSupport: 'Cours JWT',
    });

  describe('LlmFactice', () => {
    const llm = new LlmFactice();
    const numeros = new Set([2, 5]);

    it('produit le nombre demandé de questions conformes, ancrées dans les passages', async () => {
      const brute = await llm.genererQuestions(prompt(null, ['QCU', 'VRAI_FAUX', 'QCM']));
      const r = validerReponse(brute, {
        types: ['QCU', 'VRAI_FAUX', 'QCM'],
        nbDemandees: 4,
        numerosPassages: numeros,
      });
      expect(llm.modele).toBe(MODELE_FACTICE);
      expect(r?.invalides).toBe(0);
      expect(r?.valides.map((v) => v.type)).toEqual(['QCU', 'VRAI_FAUX', 'QCM', 'QCU']);
      expect(r?.valides.every((v) => v.passagesSources.length === 1)).toBe(true);
      expect(r?.valides[0].options[0].texte).toContain('Un jeton JWT est signé');
    });

    it('[factice:invalides] ajoute deux questions non conformes', async () => {
      const brute = await llm.genererQuestions(prompt('[factice:invalides]'));
      const r = validerReponse(brute, { types: ['QCU'], nbDemandees: 4, numerosPassages: numeros });
      expect(r).toMatchObject({ invalides: 2 });
      expect(r?.valides).toHaveLength(4);
    });

    it('[factice:vide] et [factice:panne]', async () => {
      await expect(llm.genererQuestions(prompt('[factice:vide]'))).resolves.toEqual({
        questions: [],
      });
      await expect(llm.genererQuestions(prompt('[factice:panne]'))).rejects.toThrow(
        'panne simulée',
      );
    });
  });

  describe('LlmAnthropic', () => {
    const creer = (reponse: unknown, echec?: unknown): { llm: LlmAnthropic; create: jest.Mock } => {
      const llm = new LlmAnthropic('sk-ant-test-0123456789abcdef', 'claude-sonnet-5-5');
      const create = jest.fn(async () => {
        if (echec) throw echec;
        return reponse;
      });
      (llm as unknown as { client: { messages: { create: jest.Mock } } }).client = {
        messages: { create },
      };
      return { llm, create };
    };

    it('le SDK ne relance jamais lui-même (BullMQ compte les tentatives)', () => {
      const llm = new LlmAnthropic('sk-ant-test-0123456789abcdef', 'claude-sonnet-5-5');
      expect((llm as unknown as { client: { maxRetries: number } }).client.maxRetries).toBe(0);
    });

    it('impose l’outil (JSON strict), consignes en système, délai par appel', async () => {
      const { llm, create } = creer({
        content: [
          { type: 'text', text: 'Voici.' },
          { type: 'tool_use', name: OUTIL_QUESTIONS, input: { questions: [{ enonce: 'x' }] } },
        ],
      });
      const p = prompt(null);
      await expect(llm.genererQuestions(p, { delaiMs: 1234 })).resolves.toEqual({
        questions: [{ enonce: 'x' }],
      });
      expect(llm.modele).toBe('claude-sonnet-5-5');
      const [corps, options] = create.mock.calls[0] as unknown as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(corps).toMatchObject({
        model: 'claude-sonnet-5-5',
        system: p.systeme,
        messages: [{ role: 'user', content: p.utilisateur }],
        tool_choice: { type: 'tool', name: OUTIL_QUESTIONS },
      });
      expect((corps.tools as Array<Record<string, unknown>>)[0]).toMatchObject({
        name: OUTIL_QUESTIONS,
        input_schema: SCHEMA_QUESTIONS,
      });
      expect(options).toEqual({ timeout: 1234 });
    });

    it('sans appel d’outil : erreur récupérable', async () => {
      const { llm } = creer({ content: [{ type: 'text', text: 'Je refuse.' }] });
      const erreur = await llm.genererQuestions(prompt(null), { delaiMs: 10 }).catch((e) => e);
      expect(erreur).toBeInstanceOf(ErreurLlm);
      expect((erreur as ErreurLlm).recuperable).toBe(true);
    });

    it('une erreur du SDK est traduite', async () => {
      const { llm } = creer(
        null,
        new Anthropic.AuthenticationError(401, {}, 'bad key', new Headers()),
      );
      const erreur = await llm.genererQuestions(prompt(null), { delaiMs: 10 }).catch((e) => e);
      expect(erreur).toBeInstanceOf(ErreurLlm);
      expect((erreur as ErreurLlm).recuperable).toBe(false);
    });
  });

  describe('traduireErreur', () => {
    const h = new Headers();
    it.each<[string, boolean, unknown]>([
      ['clé refusée', false, new Anthropic.AuthenticationError(401, {}, 'x', h)],
      ['permission', false, new Anthropic.PermissionDeniedError(403, {}, 'x', h)],
      ['modèle inconnu', false, new Anthropic.NotFoundError(404, {}, 'x', h)],
      ['requête invalide', false, new Anthropic.BadRequestError(400, {}, 'x', h)],
      ['quota', true, new Anthropic.RateLimitError(429, {}, 'x', h)],
      ['délai', true, new Anthropic.APIConnectionTimeoutError({ message: 'x' })],
      ['connexion', true, new Anthropic.APIConnectionError({ message: 'x' })],
      ['erreur serveur', true, new Anthropic.InternalServerError(500, {}, 'x', h)],
      ['inconnue', true, new Error('x')],
    ])('%s -> récupérable = %s', (_cas, recuperable, erreur) => {
      const traduite = traduireErreur(erreur);
      expect(traduite).toBeInstanceOf(ErreurLlm);
      expect(traduite.recuperable).toBe(recuperable);
      expect(traduite.message).not.toContain('sk-ant');
    });
  });

  describe('llmProvider', () => {
    const fabrique = (llmProvider as unknown as { useFactory: (c: unknown) => unknown }).useFactory;
    it('factice ou Anthropic selon la configuration', () => {
      expect(
        fabrique({ getOrThrow: () => ({ fournisseur: 'factice', modele: 'factice-v1' }) }),
      ).toBeInstanceOf(LlmFactice);
      expect(
        fabrique({
          getOrThrow: () => ({
            fournisseur: 'anthropic',
            modele: 'claude-sonnet-5-5',
            cleAnthropic: 'sk-ant-test-0123456789abcdef',
          }),
        }),
      ).toBeInstanceOf(LlmAnthropic);
    });
  });
});

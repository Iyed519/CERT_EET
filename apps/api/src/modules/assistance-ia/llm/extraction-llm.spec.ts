import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ErreurLlm, OUTIL_EXTRACTION, OUTIL_QUESTIONS, SCHEMA_EXTRACTION } from './fournisseur-llm';
import { contenuExtraction, LlmAnthropic } from './llm-anthropic';
import {
  argumentsDeLOutil,
  LlmCompatibleOpenAi,
  MESSAGE_VISION_NON_PRISE_EN_CHARGE,
} from './llm-compatible-openai';

/** US-IA-08 — extraction de questions par les fournisseurs (SDK simulé, serveur local). */
describe('Fournisseurs LLM — extraction (US-IA-08)', () => {
  const QUESTIONS = { questions: [{ enonce: 'Q ?', type: 'QCU', options: [] }] };
  const texte = {
    systeme: 'Recopie.',
    consigne: 'Recopie les questions.',
    texte: '<document>\n1. Q ?\n</document>',
  };

  describe('Anthropic', () => {
    const creer = (contenu: unknown[]): { llm: LlmAnthropic; create: jest.Mock } => {
      const llm = new LlmAnthropic('cle-test', 'claude-test');
      const create = jest.fn(async () => ({ content: contenu }));
      (llm as unknown as { client: { messages: { create: jest.Mock } } }).client = {
        messages: { create },
      };
      return { llm, create };
    };

    it('contenu : texte seul ; image puis consigne ; PDF scanné en bloc document', () => {
      expect(contenuExtraction(texte)).toEqual([
        { type: 'text', text: 'Recopie les questions.\n\n<document>\n1. Q ?\n</document>' },
      ]);
      expect(
        contenuExtraction({
          systeme: 's',
          consigne: 'Lis.',
          fichier: { nature: 'image', typeMedia: 'image/png', base64: 'QUJD' },
        }),
      ).toEqual([
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
        { type: 'text', text: 'Lis.' },
      ]);
      expect(
        contenuExtraction({
          systeme: 's',
          consigne: 'Lis.',
          fichier: { nature: 'document', typeMedia: 'application/pdf', base64: 'UERG' },
        })[0],
      ).toEqual({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'UERG' },
      });
    });

    it('appel : système, outil extraire_questions au schéma, choix auto, délai ; argument renvoyé', async () => {
      const { llm, create } = creer([
        { type: 'text', text: 'Voici.' },
        { type: 'tool_use', name: OUTIL_EXTRACTION, input: QUESTIONS },
      ]);
      await expect(llm.extraireQuestions(texte, { delaiMs: 1234 })).resolves.toEqual(QUESTIONS);
      const [corps, options] = create.mock.calls[0] as unknown as [
        Record<string, unknown>,
        { timeout: number },
      ];
      expect(corps).toMatchObject({
        model: 'claude-test',
        max_tokens: 16000,
        system: 'Recopie.',
        tool_choice: { type: 'auto' },
        tools: [{ name: OUTIL_EXTRACTION, input_schema: SCHEMA_EXTRACTION }],
      });
      expect(options).toEqual({ timeout: 1234 });
    });

    it('sans appel du bon outil : erreur récupérable', async () => {
      const { llm } = creer([{ type: 'tool_use', name: OUTIL_QUESTIONS, input: QUESTIONS }]);
      await expect(llm.extraireQuestions(texte, { delaiMs: 10 })).rejects.toMatchObject({
        name: 'ErreurLlm',
        recuperable: true,
      });
    });
  });

  describe('Compatible OpenAI', () => {
    let serveur: Server;
    let url: string;
    let recue: Record<string, unknown> | undefined;

    beforeAll(async () => {
      serveur = createServer((req: IncomingMessage, res: ServerResponse) => {
        let brut = '';
        req.on('data', (m) => (brut += m));
        req.on('end', () => {
          recue = JSON.parse(brut) as Record<string, unknown>;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        function: { name: OUTIL_EXTRACTION, arguments: JSON.stringify(QUESTIONS) },
                      },
                    ],
                  },
                },
              ],
            }),
          );
        });
      });
      await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
      url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/v1`;
    });
    afterAll(() => new Promise<void>((r) => serveur.close(() => r())));
    beforeEach(() => (recue = undefined));

    it('texte : outil extraire_questions imposé, consigne puis document', async () => {
      const llm = new LlmCompatibleOpenAi(url, 'mistral', undefined);
      await expect(llm.extraireQuestions(texte, { delaiMs: 2000 })).resolves.toEqual(QUESTIONS);
      expect(recue).toMatchObject({
        messages: [
          { role: 'system', content: 'Recopie.' },
          { role: 'user', content: 'Recopie les questions.\n\n<document>\n1. Q ?\n</document>' },
        ],
        tool_choice: { type: 'function', function: { name: OUTIL_EXTRACTION } },
      });
    });

    it('image ou PDF scanné : refus non récupérable, aucune requête envoyée', async () => {
      const llm = new LlmCompatibleOpenAi(url, 'mistral', undefined);
      const appel = llm.extraireQuestions(
        {
          systeme: 's',
          consigne: 'c',
          fichier: { nature: 'image', typeMedia: 'image/png', base64: '' },
        },
        { delaiMs: 2000 },
      );
      await expect(appel).rejects.toThrow(MESSAGE_VISION_NON_PRISE_EN_CHARGE);
      await expect(appel).rejects.toMatchObject({ recuperable: false });
      await expect(
        llm.extraireQuestions({ systeme: 's', consigne: 'c' }, { delaiMs: 10 }),
      ).rejects.toBeInstanceOf(ErreurLlm);
      expect(recue).toBeUndefined();
    });

    it('argumentsDeLOutil : cherche l’outil demandé (génération par défaut)', () => {
      const corps = {
        choices: [
          {
            message: {
              tool_calls: [{ function: { name: OUTIL_EXTRACTION, arguments: '{"questions":[]}' } }],
            },
          },
        ],
      };
      expect(argumentsDeLOutil(corps, OUTIL_EXTRACTION)).toEqual({ questions: [] });
      expect(() => argumentsDeLOutil(corps)).toThrow(ErreurLlm);
    });
  });
});

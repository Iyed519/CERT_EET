import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ErreurLlm, OUTIL_QUESTIONS } from './fournisseur-llm';
import { argumentsDeLOutil, erreurHttp, LlmCompatibleOpenAi } from './llm-compatible-openai';
import { llmProvider } from './llm.provider';

/**
 * US-IA-06 — Fournisseur « compatible OpenAI » contre un VRAI serveur HTTP
 * local (requête, en-têtes, outil imposé, réponses et erreurs), et garde
 * d'architecture : aucun module métier n'importe un adaptateur.
 */
describe('LlmCompatibleOpenAi (US-IA-06)', () => {
  let serveur: Server;
  let url: string;
  let reponse: { statut: number; corps: unknown; attenteMs?: number };
  let recue: { url?: string; auth?: string; corps?: Record<string, unknown> };

  const QUESTIONS = { questions: [{ enonce: 'Q ?', type: 'QCU' }] };
  const prompt = { systeme: 'Tu es un formateur.', utilisateur: 'Passages…' };

  beforeAll(async () => {
    serveur = createServer((req: IncomingMessage, res: ServerResponse) => {
      let brut = '';
      req.on('data', (m) => (brut += m));
      req.on('end', () => {
        recue = {
          url: req.url,
          auth: req.headers.authorization,
          corps: JSON.parse(brut) as Record<string, unknown>,
        };
        setTimeout(() => {
          res.writeHead(reponse.statut, { 'Content-Type': 'application/json' });
          res.end(
            typeof reponse.corps === 'string' ? reponse.corps : JSON.stringify(reponse.corps),
          );
        }, reponse.attenteMs ?? 0);
      });
    });
    await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/v1/`;
  });
  afterAll(() => new Promise<void>((r) => serveur.close(() => r())));
  beforeEach(() => {
    recue = {};
    reponse = {
      statut: 200,
      corps: {
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: OUTIL_QUESTIONS, arguments: JSON.stringify(QUESTIONS) } },
              ],
            },
          },
        ],
      },
    };
  });

  it('POST /chat/completions : modèle, messages, outil imposé, clé ; argument de l’outil', async () => {
    const llm = new LlmCompatibleOpenAi(url, 'mistral-large', 'cle-test');
    await expect(llm.genererQuestions(prompt, { delaiMs: 2000 })).resolves.toEqual(QUESTIONS);
    expect(recue.url).toBe('/v1/chat/completions');
    expect(recue.auth).toBe('Bearer cle-test');
    expect(recue.corps).toMatchObject({
      model: 'mistral-large',
      messages: [
        { role: 'system', content: prompt.systeme },
        { role: 'user', content: prompt.utilisateur },
      ],
      tool_choice: { type: 'function', function: { name: OUTIL_QUESTIONS } },
    });
    expect((recue.corps?.tools as Array<{ function: { name: string } }>)[0].function.name).toBe(
      OUTIL_QUESTIONS,
    );
    expect(llm.modele).toBe('mistral-large');
  });

  it('sans clé : aucun en-tête Authorization (modèle hébergé localement)', async () => {
    await new LlmCompatibleOpenAi(url, 'local', undefined).genererQuestions(prompt, {
      delaiMs: 2000,
    });
    expect(recue.auth).toBeUndefined();
  });

  it.each([
    [401, false],
    [403, false],
    [404, false],
    [400, false],
    [408, true],
    [429, true],
    [500, true],
    [503, true],
  ])('HTTP %i -> ErreurLlm récupérable = %s', async (statut, recuperable) => {
    reponse = { statut, corps: { error: 'x' } };
    const erreur = await new LlmCompatibleOpenAi(url, 'm', 'secret-0123')
      .genererQuestions(prompt, { delaiMs: 2000 })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurLlm);
    expect((erreur as ErreurLlm).recuperable).toBe(recuperable);
    expect((erreur as ErreurLlm).message).not.toContain('secret');
  });

  it('délai dépassé ou serveur injoignable -> récupérable', async () => {
    reponse.attenteMs = 300;
    await expect(
      new LlmCompatibleOpenAi(url, 'm', undefined).genererQuestions(prompt, { delaiMs: 50 }),
    ).rejects.toThrow(/à temps/);
    await expect(
      new LlmCompatibleOpenAi('http://127.0.0.1:9/v1', 'm', undefined).genererQuestions(prompt, {
        delaiMs: 2000,
      }),
    ).rejects.toThrow(/injoignable/);
  });

  it('réponse sans appel d’outil ou JSON illisible -> récupérable', async () => {
    reponse = { statut: 200, corps: { choices: [{ message: { content: 'Bonjour' } }] } };
    await expect(
      new LlmCompatibleOpenAi(url, 'm', undefined).genererQuestions(prompt, { delaiMs: 2000 }),
    ).rejects.toMatchObject({ recuperable: true });
    reponse = { statut: 200, corps: 'pas du json' };
    await expect(
      new LlmCompatibleOpenAi(url, 'm', undefined).genererQuestions(prompt, { delaiMs: 2000 }),
    ).rejects.toThrow(/illisible/);
  });

  it('argumentsDeLOutil : objet déjà structuré accepté ; mauvais outil ignoré ; JSON invalide refusé', () => {
    const avec = (fn: unknown): unknown => ({ choices: [{ message: { tool_calls: [fn] } }] });
    expect(
      argumentsDeLOutil(avec({ function: { name: OUTIL_QUESTIONS, arguments: QUESTIONS } })),
    ).toEqual(QUESTIONS);
    expect(() => argumentsDeLOutil(avec({ function: { name: 'autre', arguments: '{}' } }))).toThrow(
      ErreurLlm,
    );
    expect(() =>
      argumentsDeLOutil(avec({ function: { name: OUTIL_QUESTIONS, arguments: '{x' } })),
    ).toThrow(/illisible/);
    expect(erreurHttp(418).recuperable).toBe(false);
  });

  it('fabrique : compatible-openai selon la configuration', () => {
    const fabrique = (llmProvider as unknown as { useFactory: (c: unknown) => unknown }).useFactory;
    const llm = fabrique({
      getOrThrow: () => ({
        fournisseur: 'compatible-openai',
        modele: 'mistral-large',
        urlCompatible: 'http://localhost:8000/v1',
        cle: undefined,
      }),
    });
    expect(llm).toBeInstanceOf(LlmCompatibleOpenAi);
    expect((llm as LlmCompatibleOpenAi).modele).toBe('mistral-large');
  });

  it('architecture : aucun module hors de llm/ n’importe un adaptateur', () => {
    const racine = join(__dirname, '..', '..', '..');
    const fichiers: string[] = [];
    const parcourir = (dossier: string): void => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (nom.endsWith('.ts') && !nom.endsWith('.spec.ts')) fichiers.push(chemin);
      }
    };
    parcourir(racine);
    const fautifs = fichiers.filter(
      (f) =>
        !relative(racine, f).startsWith(join('modules', 'assistance-ia', 'llm')) &&
        /from '.*llm-(anthropic|compatible-openai|factice)'/.test(readFileSync(f, 'utf8')),
    );
    expect(fichiers.length).toBeGreaterThan(100);
    expect(fautifs).toEqual([]);
  });
});

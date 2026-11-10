import {
  ErreurLlm,
  FournisseurLlm,
  OptionsAppelLlm,
  OUTIL_QUESTIONS,
  PromptGeneration,
  SCHEMA_QUESTIONS,
} from './fournisseur-llm';

/**
 * US-IA-06 — Fournisseur « compatible OpenAI » : tout service qui expose
 * `POST {url}/chat/completions` avec appel d'outil (OpenAI, Mistral, ou un
 * modèle HÉBERGÉ EN TUNISIE derrière vLLM / Ollama — souveraineté des
 * données). Aucune dépendance : `fetch` de Node.
 *
 * JSON STRICT, comme pour Anthropic : l'outil `proposer_questions` est
 * imposé (`tool_choice`), son schéma décrit exactement la sortie ; on lit
 * l'argument de l'appel. Aucune reprise ici : c'est BullMQ qui réessaie.
 */
export class LlmCompatibleOpenAi implements FournisseurLlm {
  private readonly url: string;

  constructor(
    url: string,
    readonly modele: string,
    private readonly cle: string | undefined,
  ) {
    this.url = url.replace(/\/+$/, '');
  }

  async genererQuestions(prompt: PromptGeneration, options: OptionsAppelLlm): Promise<unknown> {
    let reponse: Response;
    try {
      reponse = await fetch(`${this.url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.cle ? { Authorization: `Bearer ${this.cle}` } : {}),
        },
        body: JSON.stringify({
          model: this.modele,
          temperature: 0.2,
          messages: [
            { role: 'system', content: prompt.systeme },
            { role: 'user', content: prompt.utilisateur },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: OUTIL_QUESTIONS,
                description: 'Enregistre les questions proposées, au format imposé.',
                parameters: SCHEMA_QUESTIONS,
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: OUTIL_QUESTIONS } },
        }),
        signal: AbortSignal.timeout(options.delaiMs),
      });
    } catch (erreur) {
      // DOMException (AbortSignal.timeout) : pas toujours `instanceof Error` selon le contexte.
      const nom = (erreur as { name?: unknown } | null)?.name;
      const delai = nom === 'TimeoutError' || nom === 'AbortError';
      throw new ErreurLlm(
        delai ? 'Le fournisseur d’IA n’a pas répondu à temps.' : 'Fournisseur d’IA injoignable.',
        true,
      );
    }
    if (!reponse.ok) throw erreurHttp(reponse.status);
    let corps: unknown;
    try {
      corps = await reponse.json();
    } catch {
      throw new ErreurLlm('Réponse illisible du fournisseur d’IA.', true);
    }
    return argumentsDeLOutil(corps);
  }
}

/** Statut HTTP -> ErreurLlm (récupérable : 408, 429, 5xx). */
export function erreurHttp(statut: number): ErreurLlm {
  if (statut === 401 || statut === 403) {
    return new ErreurLlm('Clé du fournisseur d’IA refusée : vérifiez LLM_CLE.', false);
  }
  if (statut === 404)
    return new ErreurLlm(
      'Modèle ou adresse d’IA inconnus : vérifiez LLM_URL et LLM_MODELE.',
      false,
    );
  if (statut === 408) return new ErreurLlm('Le fournisseur d’IA n’a pas répondu à temps.', true);
  if (statut === 429) return new ErreurLlm('Fournisseur d’IA saturé (limite de débit).', true);
  if (statut >= 500) return new ErreurLlm(`Erreur du fournisseur d’IA (${statut}).`, true);
  return new ErreurLlm('Requête refusée par le fournisseur d’IA.', false);
}

/** Argument de l'appel à `proposer_questions` (objet JSON), sinon ErreurLlm récupérable. */
export function argumentsDeLOutil(corps: unknown): unknown {
  const appels = (
    corps as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> };
      }>;
    }
  )?.choices?.[0]?.message?.tool_calls;
  const appel = appels?.find((a) => a.function?.name === OUTIL_QUESTIONS);
  if (!appel) throw new ErreurLlm('Le modèle n’a renvoyé aucune question.', true);
  const brut = appel.function?.arguments;
  if (typeof brut !== 'string') return brut;
  try {
    return JSON.parse(brut);
  } catch {
    throw new ErreurLlm('Réponse illisible du fournisseur d’IA.', true);
  }
}

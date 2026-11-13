import {
  DemandeExtraction,
  ErreurLlm,
  FournisseurLlm,
  OptionsAppelLlm,
  OUTIL_ANALYSE,
  OUTIL_EXTRACTION,
  OUTIL_QUESTIONS,
  PromptGeneration,
  SCHEMA_ANALYSE,
  SCHEMA_EXTRACTION,
  SCHEMA_QUESTIONS,
} from './fournisseur-llm';

/** US-IA-08 : ce fournisseur ne reçoit que du texte. */
export const MESSAGE_VISION_NON_PRISE_EN_CHARGE =
  'Ce fournisseur d’IA ne lit pas les images ni les PDF scannés : déposez un document texte (PDF texte, DOCX, CSV, XLSX, TXT).';

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
    return this.appeler(
      prompt.systeme,
      prompt.utilisateur,
      OUTIL_QUESTIONS,
      'Enregistre les questions proposées, au format imposé.',
      SCHEMA_QUESTIONS,
      options,
    );
  }

  /**
   * US-IA-08 — Extraction : même appel, outil `extraire_questions`. Texte
   * seulement : une image ou un PDF scanné est refusé (erreur non
   * récupérable, message clair) ; aucune requête n'est envoyée.
   */
  async extraireQuestions(demande: DemandeExtraction, options: OptionsAppelLlm): Promise<unknown> {
    if (demande.fichier || demande.texte === undefined) {
      throw new ErreurLlm(MESSAGE_VISION_NON_PRISE_EN_CHARGE, false);
    }
    return this.appeler(
      demande.systeme,
      `${demande.consigne}\n\n${demande.texte}`,
      OUTIL_EXTRACTION,
      'Enregistre les questions recopiées du document, au format imposé.',
      SCHEMA_EXTRACTION,
      options,
    );
  }

  /** US-IA-10 — Analyse des points faibles : même appel, outil `analyser_points_faibles`. */
  async analyserPointsFaibles(
    prompt: PromptGeneration,
    options: OptionsAppelLlm,
  ): Promise<unknown> {
    return this.appeler(
      prompt.systeme,
      prompt.utilisateur,
      OUTIL_ANALYSE,
      'Enregistre l’analyse des points faibles, au format imposé.',
      SCHEMA_ANALYSE,
      options,
    );
  }

  private async appeler(
    systeme: string,
    utilisateur: string,
    outil: string,
    description: string,
    schema: unknown,
    options: OptionsAppelLlm,
  ): Promise<unknown> {
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
            { role: 'system', content: systeme },
            { role: 'user', content: utilisateur },
          ],
          tools: [{ type: 'function', function: { name: outil, description, parameters: schema } }],
          tool_choice: { type: 'function', function: { name: outil } },
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
    return argumentsDeLOutil(corps, outil);
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

/** Argument de l'appel à l'outil (objet JSON), sinon ErreurLlm récupérable. */
export function argumentsDeLOutil(corps: unknown, outil: string = OUTIL_QUESTIONS): unknown {
  const appels = (
    corps as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> };
      }>;
    }
  )?.choices?.[0]?.message?.tool_calls;
  const appel = appels?.find((a) => a.function?.name === outil);
  if (!appel) throw new ErreurLlm('Le modèle n’a renvoyé aucune question.', true);
  const brut = appel.function?.arguments;
  if (typeof brut !== 'string') return brut;
  try {
    return JSON.parse(brut);
  } catch {
    throw new ErreurLlm('Réponse illisible du fournisseur d’IA.', true);
  }
}

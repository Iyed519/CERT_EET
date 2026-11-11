import Anthropic from '@anthropic-ai/sdk';
import {
  ErreurLlm,
  FournisseurLlm,
  OptionsAppelLlm,
  OUTIL_QUESTIONS,
  PromptGeneration,
  SCHEMA_QUESTIONS,
} from './fournisseur-llm';

/** Jetons de sortie maximum : 20 questions détaillées tiennent largement. */
const JETONS_SORTIE_MAX = 8000;

/**
 * Fournisseur Anthropic (Claude) — décision du 09/11/2026 : API hébergée pour
 * la qualité (très bon français, JSON fiable).
 *
 * JSON STRICT : le modèle répond en appelant l'outil `proposer_questions`
 * dont le schéma décrit exactement la sortie ; sa réponse est l'argument de
 * cet appel, déjà structuré. Le choix d'outil reste `auto` : les modèles
 * récents (dont claude-sonnet-5-5) refusent `tool_choice` « tool » ou « any »
 * (HTTP 400). La consigne du prompt impose l'outil ; une réponse sans appel
 * d'outil est une erreur récupérable, que BullMQ réessaie. Aucune reprise dans
 * le SDK (`maxRetries: 0`) : c'est BullMQ qui réessaie, avec son délai
 * exponentiel et le compte des tentatives.
 */
export class LlmAnthropic implements FournisseurLlm {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly modele: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async genererQuestions(prompt: PromptGeneration, options: OptionsAppelLlm): Promise<unknown> {
    let reponse: Anthropic.Message;
    try {
      reponse = await this.client.messages.create(
        {
          model: this.modele,
          max_tokens: JETONS_SORTIE_MAX,
          system: prompt.systeme,
          messages: [{ role: 'user', content: prompt.utilisateur }],
          tools: [
            {
              name: OUTIL_QUESTIONS,
              description: 'Enregistre les questions proposées, au format imposé.',
              input_schema: SCHEMA_QUESTIONS as unknown as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: 'auto' },
        },
        { timeout: options.delaiMs },
      );
    } catch (erreur) {
      throw traduireErreur(erreur);
    }
    const appel = reponse.content.find(
      (bloc): bloc is Anthropic.ToolUseBlock =>
        bloc.type === 'tool_use' && bloc.name === OUTIL_QUESTIONS,
    );
    if (!appel) throw new ErreurLlm('Le modèle n’a renvoyé aucune question.', true);
    return appel.input;
  }
}

/** Longueur maximale du motif renvoyé par le fournisseur, recopié dans l'erreur. */
const MOTIF_MAX = 200;

/**
 * Motif d'une requête refusée, tel que l'API l'explique (ex. option non
 * prise en charge par le modèle), ou chaîne vide s'il manque. Ce texte ne contient jamais la clé ; il
 * est tronqué pour rester lisible dans l'interface et les journaux.
 */
function motifDuFournisseur(erreur: InstanceType<typeof Anthropic.APIError>): string {
  const corps = erreur.error as { error?: { message?: unknown } } | undefined;
  const motif = corps?.error?.message;
  return typeof motif === 'string' ? motif.trim().slice(0, MOTIF_MAX) : '';
}

/** Erreur du SDK -> ErreurLlm (message français, sans détail sensible). */
export function traduireErreur(erreur: unknown): ErreurLlm {
  if (
    erreur instanceof Anthropic.AuthenticationError ||
    erreur instanceof Anthropic.PermissionDeniedError
  ) {
    return new ErreurLlm('Clé du fournisseur d’IA refusée : vérifiez ANTHROPIC_API_KEY.', false);
  }
  if (erreur instanceof Anthropic.NotFoundError) {
    return new ErreurLlm('Modèle d’IA inconnu : vérifiez LLM_MODELE.', false);
  }
  if (erreur instanceof Anthropic.BadRequestError) {
    const motif = motifDuFournisseur(erreur);
    return new ErreurLlm(
      motif
        ? `Requête refusée par le fournisseur d’IA : ${motif}`
        : 'Requête refusée par le fournisseur d’IA.',
      false,
    );
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return new ErreurLlm('Fournisseur d’IA saturé (limite de débit).', true);
  }
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErreurLlm('Le fournisseur d’IA n’a pas répondu à temps.', true);
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return new ErreurLlm('Fournisseur d’IA injoignable.', true);
  }
  if (erreur instanceof Anthropic.APIError) {
    return new ErreurLlm(`Erreur du fournisseur d’IA (${erreur.status ?? 'inconnue'}).`, true);
  }
  return new ErreurLlm('Erreur inattendue lors de l’appel au fournisseur d’IA.', true);
}

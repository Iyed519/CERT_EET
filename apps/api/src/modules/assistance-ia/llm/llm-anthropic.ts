import Anthropic from '@anthropic-ai/sdk';
import {
  DemandeExtraction,
  ErreurLlm,
  FournisseurLlm,
  OptionsAppelLlm,
  OUTIL_EXTRACTION,
  OUTIL_QUESTIONS,
  PromptGeneration,
  SCHEMA_EXTRACTION,
  SCHEMA_QUESTIONS,
} from './fournisseur-llm';

/** Jetons de sortie maximum : 20 questions détaillées tiennent largement. */
const JETONS_SORTIE_MAX = 8000;
/** US-IA-08 : jusqu'à 100 questions recopiées avec leurs options. */
const JETONS_SORTIE_EXTRACTION = 16000;

/**
 * Contenu du message de l'utilisateur pour une extraction (US-IA-08) : le
 * document d'abord (bloc `image` ou `document` base64 pour une lecture
 * visuelle, ou texte), puis la consigne. Exporté pour les tests.
 */
export function contenuExtraction(demande: DemandeExtraction): Anthropic.ContentBlockParam[] {
  const blocs: Anthropic.ContentBlockParam[] = [];
  if (demande.fichier?.nature === 'image') {
    blocs.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: demande.fichier.typeMedia as 'image/png' | 'image/jpeg' | 'image/webp',
        data: demande.fichier.base64,
      },
    });
  } else if (demande.fichier?.nature === 'document') {
    blocs.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: demande.fichier.base64 },
    });
  }
  blocs.push({
    type: 'text',
    text:
      demande.texte !== undefined ? `${demande.consigne}\n\n${demande.texte}` : demande.consigne,
  });
  return blocs;
}

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
    return this.appeler(
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
      OUTIL_QUESTIONS,
      options,
    );
  }

  /**
   * US-IA-08 — Extraction : texte, image (vision) ou PDF (lecture visuelle),
   * outil `extraire_questions`, choix d'outil `auto` pour la même raison que
   * la génération.
   */
  async extraireQuestions(demande: DemandeExtraction, options: OptionsAppelLlm): Promise<unknown> {
    return this.appeler(
      {
        model: this.modele,
        max_tokens: JETONS_SORTIE_EXTRACTION,
        system: demande.systeme,
        messages: [{ role: 'user', content: contenuExtraction(demande) }],
        tools: [
          {
            name: OUTIL_EXTRACTION,
            description: 'Enregistre les questions recopiées du document, au format imposé.',
            input_schema: SCHEMA_EXTRACTION as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'auto' },
      },
      OUTIL_EXTRACTION,
      options,
    );
  }

  private async appeler(
    corps: Anthropic.MessageCreateParamsNonStreaming,
    outil: string,
    options: OptionsAppelLlm,
  ): Promise<unknown> {
    let reponse: Anthropic.Message;
    try {
      reponse = await this.client.messages.create(corps, { timeout: options.delaiMs });
    } catch (erreur) {
      throw traduireErreur(erreur);
    }
    const appel = reponse.content.find(
      (bloc): bloc is Anthropic.ToolUseBlock => bloc.type === 'tool_use' && bloc.name === outil,
    );
    if (!appel) throw new ErreurLlm('Le modèle n’a renvoyé aucune question.', true);
    return appel.input;
  }
}

/** US-IA-09 — Messages des erreurs les plus fréquentes, affichés tels quels dans l'interface. */
export const MESSAGE_CREDIT_EPUISE =
  'Crédit Anthropic épuisé : rechargez le compte sur console.anthropic.com (Plans & Billing) ou changez de clé.';
export const MESSAGE_SURCHARGE = 'Claude est surchargé en ce moment (nouvel essai automatique).';
export const MESSAGE_LIMITE_DEBIT =
  'Limite de débit du compte Anthropic atteinte (nouvel essai automatique).';
export const MESSAGE_DOCUMENT_TROP_GROS = 'Document trop volumineux pour le fournisseur d’IA.';

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
  if (erreur instanceof Anthropic.APIError && erreur.status === 413) {
    return new ErreurLlm(MESSAGE_DOCUMENT_TROP_GROS, false);
  }
  if (erreur instanceof Anthropic.BadRequestError) {
    const motif = motifDuFournisseur(erreur);
    // US-IA-09 : crédit épuisé, en français et définitif (réessayer ne sert à rien).
    if (/credit balance|purchase credits|billing/i.test(motif)) {
      return new ErreurLlm(MESSAGE_CREDIT_EPUISE, false);
    }
    return new ErreurLlm(
      motif
        ? `Requête refusée par le fournisseur d’IA : ${motif}`
        : 'Requête refusée par le fournisseur d’IA.',
      false,
    );
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return new ErreurLlm(MESSAGE_LIMITE_DEBIT, true);
  }
  if (erreur instanceof Anthropic.APIError && erreur.status === 529) {
    return new ErreurLlm(MESSAGE_SURCHARGE, true);
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

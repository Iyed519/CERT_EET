/**
 * Couche d'abstraction du modèle de langage (ADR-05, US-IA-03 ; anticipe
 * US-IA-06) : le pipeline ne connaît que cette interface ; la fabrique
 * (llm.provider.ts) choisit l'implémentation selon LLM_FOURNISSEUR
 * (`anthropic` | `factice`).
 *
 * Le fournisseur renvoie l'objet JSON BRUT produit par le modèle : il n'est
 * jamais digne de confiance, la validation (generation-pipeline.regles.ts)
 * décide de ce qui devient une suggestion.
 */
export const FOURNISSEUR_LLM = Symbol('FOURNISSEUR_LLM');

/** Ce qui part au modèle : consignes (système) et demande avec le contexte. */
export interface PromptGeneration {
  systeme: string;
  utilisateur: string;
}

export interface OptionsAppelLlm {
  delaiMs: number;
}

export interface FournisseurLlm {
  /** Identifiant du modèle, enregistré sur la génération. */
  readonly modele: string;
  genererQuestions(prompt: PromptGeneration, options: OptionsAppelLlm): Promise<unknown>;
}

/**
 * Erreur d'appel au modèle. `recuperable` : une nouvelle tentative a une
 * chance d'aboutir (délai dépassé, surcharge, panne réseau) ; sinon (clé
 * refusée, requête rejetée) le travail échoue tout de suite.
 */
export class ErreurLlm extends Error {
  constructor(
    message: string,
    public readonly recuperable: boolean,
  ) {
    super(message);
    this.name = 'ErreurLlm';
  }
}

/** Nom de l'outil imposé au modèle : sa seule sortie possible (JSON au schéma). */
export const OUTIL_QUESTIONS = 'proposer_questions';

/** Schéma JSON imposé (Anthropic : outil forcé ; le fournisseur factice le respecte). */
export const SCHEMA_QUESTIONS = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['enonce', 'type', 'options', 'explication', 'passages', 'scoreConfiance'],
        properties: {
          enonce: { type: 'string', description: 'Énoncé de la question, en français.' },
          type: { type: 'string', enum: ['QCU', 'QCM', 'VRAI_FAUX'] },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['texte', 'estCorrecte'],
              properties: {
                texte: { type: 'string' },
                estCorrecte: { type: 'boolean' },
              },
            },
          },
          explication: {
            type: 'string',
            description: 'Pourquoi la bonne réponse est juste, d’après les passages.',
          },
          passages: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Numéros des passages qui justifient la question.',
          },
          scoreConfiance: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

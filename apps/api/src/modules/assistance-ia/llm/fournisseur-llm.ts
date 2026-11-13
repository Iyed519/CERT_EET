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

/** Identifiant du modèle factice (démonstration, tests). */
export const MODELE_FACTICE = 'factice-v1';

/** Ce qui part au modèle : consignes (système) et demande avec le contexte. */
export interface PromptGeneration {
  systeme: string;
  utilisateur: string;
}

export interface OptionsAppelLlm {
  delaiMs: number;
}

/**
 * US-IA-08 — Ce qui part au modèle pour une extraction : consignes (système),
 * demande, et le document — soit son TEXTE (PDF texte, DOCX, TXT, CSV, XLSX
 * rendus en texte), soit le FICHIER lui-même pour une lecture visuelle
 * (image, PDF scanné), en base64.
 */
export interface DemandeExtraction {
  systeme: string;
  consigne: string;
  texte?: string;
  fichier?: {
    nature: 'image' | 'document';
    typeMedia: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
    base64: string;
  };
}

export interface FournisseurLlm {
  /** Identifiant du modèle, enregistré sur la génération. */
  readonly modele: string;
  genererQuestions(prompt: PromptGeneration, options: OptionsAppelLlm): Promise<unknown>;
  /**
   * US-IA-08 — Recopie les questions présentes dans un document. Renvoie
   * l'objet JSON BRUT (`{ questions: [...] }`), validé ensuite par
   * extraction-questions.regles.ts.
   */
  extraireQuestions(demande: DemandeExtraction, options: OptionsAppelLlm): Promise<unknown>;
  /**
   * US-IA-10 — Analyse les erreurs d'un apprenant (points faibles, quoi
   * travailler). Renvoie l'objet JSON BRUT (`{ synthese, axes, encouragement }`),
   * validé ensuite par analyse-points-faibles.regles.ts.
   */
  analyserPointsFaibles(prompt: PromptGeneration, options: OptionsAppelLlm): Promise<unknown>;
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

/** US-IA-09 — Erreur du fournisseur d'IA (instance ou objet reçu de la file). */
export function estErreurLlm(erreur: unknown): boolean {
  return erreur instanceof ErreurLlm || (erreur as { name?: string } | null)?.name === 'ErreurLlm';
}

/**
 * US-IA-09 — Motif d'un travail interrompu après ses tentatives par une erreur
 * du fournisseur : la cause reste lisible (« … (fournisseur d'IA indisponible :
 * Claude est surchargé en ce moment) : relancez-la. »).
 */
export function motifApresTentatives(travail: 'Extraction' | 'Génération', cause: string): string {
  const nette = cause
    .replace(/\s*\(nouvel essai automatique\)/, '')
    .trim()
    .replace(/\.$/, '');
  return `${travail} interrompue après plusieurs tentatives (fournisseur d’IA indisponible : ${nette}) : relancez-la.`;
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

/** US-IA-08 — Outil imposé pour l'extraction : sa seule sortie possible. */
export const OUTIL_EXTRACTION = 'extraire_questions';

/** Plafond de questions recopiées d'un seul document (US-IA-08). */
export const MAX_QUESTIONS_EXTRAITES = 100;

/**
 * Schéma JSON de l'extraction (US-IA-08). `estCorrecte` vaut null quand le
 * document ne dit pas quelle option est juste : le modèle ne doit pas deviner.
 */
export const SCHEMA_EXTRACTION = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      maxItems: MAX_QUESTIONS_EXTRAITES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['enonce', 'type', 'options', 'explication', 'niveau'],
        properties: {
          enonce: { type: 'string', description: 'Énoncé recopié du document.' },
          type: { type: 'string', enum: ['QCU', 'QCM', 'VRAI_FAUX'] },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['texte', 'estCorrecte'],
              properties: {
                texte: { type: 'string' },
                estCorrecte: {
                  type: ['boolean', 'null'],
                  description: 'null si le document ne donne pas la bonne réponse.',
                },
              },
            },
          },
          explication: { type: ['string', 'null'] },
          niveau: {
            type: ['string', 'null'],
            enum: ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', null],
          },
        },
      },
    },
  },
} as const;

/** US-IA-10 — Outil imposé pour l'analyse des points faibles. */
export const OUTIL_ANALYSE = 'analyser_points_faibles';

/** Schéma JSON de l'analyse des points faibles (US-IA-10). */
export const SCHEMA_ANALYSE = {
  type: 'object',
  additionalProperties: false,
  required: ['synthese', 'axes', 'encouragement'],
  properties: {
    synthese: {
      type: 'string',
      description: 'Deux ou trois phrases : le niveau global et les faiblesses principales.',
    },
    axes: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['notion', 'constat', 'conseil', 'questions'],
        properties: {
          notion: { type: 'string', description: 'La notion à travailler, en quelques mots.' },
          constat: {
            type: 'string',
            description: 'Ce que les réponses montrent (l’erreur de raisonnement probable).',
          },
          conseil: {
            type: 'string',
            description: 'Quoi faire concrètement (passage du cours à relire, exercice, méthode).',
          },
          questions: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Numéros des questions concernées.',
          },
        },
      },
    },
    encouragement: { type: 'string', description: 'Une phrase pour la suite.' },
  },
} as const;

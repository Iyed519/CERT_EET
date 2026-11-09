/**
 * Couche d'abstraction des EMBEDDINGS (US-IA-01, ADR-05 : fournisseurs
 * interchangeables par configuration, sans toucher au code métier).
 *
 * Anthropic ne fournit pas d'API d'embeddings ; la génération (US-IA-03) et la
 * vectorisation sont donc deux interfaces distinctes. Le code métier ne
 * connaît que celle-ci ; la fabrique (embeddings.provider.ts) choisit
 * l'implémentation selon EMBEDDINGS_FOURNISSEUR.
 *
 * Les vecteurs d'un support n'ont de sens qu'avec le modèle qui les a
 * produits : `modele` est enregistré sur chaque support indexé, et la
 * recherche (US-IA-03) ne compare que des vecteurs du même modèle. Changer de
 * fournisseur demande donc de réindexer les supports — jamais de mélange.
 */
export const FOURNISSEUR_EMBEDDINGS = Symbol('FOURNISSEUR_EMBEDDINGS');

/** Dimension des vecteurs, fixée par la colonne `vector(384)` en base. */
export const DIMENSION_EMBEDDINGS = 384;

/** Un passage de support (indexation) ou une requête (recherche, US-IA-03). */
export type UsageEmbedding = 'passage' | 'requete';

export interface FournisseurEmbeddings {
  /** Identifiant du modèle, enregistré avec les vecteurs (≤ 100 caractères). */
  readonly modele: string;
  /** Vecteurs normés (longueur 1) de dimension DIMENSION_EMBEDDINGS, dans l'ordre des textes. */
  vectoriser(textes: readonly string[], usage: UsageEmbedding): Promise<number[][]>;
}

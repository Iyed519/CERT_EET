import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IaConfig } from '../../../config/configuration';
import { EmbeddingsHachage } from './embeddings-hachage';
import { FOURNISSEUR_EMBEDDINGS, FournisseurEmbeddings } from './fournisseur-embeddings';

/**
 * Fabrique du fournisseur d'embeddings (ADR-05) : EMBEDDINGS_FOURNISSEUR
 * choisit l'implémentation au démarrage. Un nouveau fournisseur = une classe
 * qui implémente FournisseurEmbeddings + une branche ici ; aucun service
 * métier ne change.
 */
export const embeddingsProvider: Provider = {
  provide: FOURNISSEUR_EMBEDDINGS,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): FournisseurEmbeddings => {
    const { embeddingsFournisseur } = configService.getOrThrow<IaConfig>('ia');
    switch (embeddingsFournisseur) {
      case 'hachage':
      default:
        return new EmbeddingsHachage();
    }
  },
};

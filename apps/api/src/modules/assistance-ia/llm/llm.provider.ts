import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmConfig } from '../../../config/configuration';
import { FOURNISSEUR_LLM, FournisseurLlm } from './fournisseur-llm';
import { LlmAnthropic } from './llm-anthropic';
import { LlmFactice } from './llm-factice';

/**
 * Fabrique du fournisseur de génération (ADR-05) : LLM_FOURNISSEUR choisit
 * l'implémentation ; LLM_MODELE le modèle. Sans clé, `anthropic` est refusé
 * au démarrage (validation de l'environnement).
 */
export const llmProvider: Provider = {
  provide: FOURNISSEUR_LLM,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): FournisseurLlm => {
    const config = configService.getOrThrow<LlmConfig>('llm');
    if (config.fournisseur === 'anthropic') {
      return new LlmAnthropic(config.cleAnthropic as string, config.modele);
    }
    return new LlmFactice();
  },
};

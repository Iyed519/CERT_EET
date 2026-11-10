import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmConfig } from '../../../config/configuration';
import { FOURNISSEUR_LLM, FournisseurLlm } from './fournisseur-llm';
import { LlmAnthropic } from './llm-anthropic';
import { LlmCompatibleOpenAi } from './llm-compatible-openai';
import { LlmFactice } from './llm-factice';

/**
 * Fabrique du fournisseur de génération (ADR-05, US-IA-06) : LLM_FOURNISSEUR
 * choisit l'implémentation (`anthropic`, `compatible-openai`, `factice`) ;
 * LLM_MODELE le modèle. C'est le SEUL endroit qui connaît les adaptateurs :
 * changer de fournisseur ne touche aucun module métier. Sans clé, `anthropic`
 * est refusé au démarrage ; sans URL, `compatible-openai` aussi.
 */
export const llmProvider: Provider = {
  provide: FOURNISSEUR_LLM,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): FournisseurLlm => {
    const config = configService.getOrThrow<LlmConfig>('llm');
    if (config.fournisseur === 'anthropic') {
      return new LlmAnthropic(config.cleAnthropic as string, config.modele);
    }
    if (config.fournisseur === 'compatible-openai') {
      return new LlmCompatibleOpenAi(config.urlCompatible as string, config.modele, config.cle);
    }
    return new LlmFactice();
  },
};

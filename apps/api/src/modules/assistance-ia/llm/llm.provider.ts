import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmConfig } from '../../../config/configuration';
import { FOURNISSEUR_LLM, FournisseurLlm } from './fournisseur-llm';
import { LlmAnthropic } from './llm-anthropic';
import { LlmCompatibleOpenAi } from './llm-compatible-openai';
import { LlmFactice } from './llm-factice';
import { LlmNonConfigure } from './llm-non-configure';

/**
 * Fabrique du fournisseur de génération (ADR-05, US-IA-06) : la configuration
 * résout l'implémentation (US-IA-09 : la clé Anthropic prime, `factice`
 * seulement sur demande explicite sans clé, sinon `non-configure`) ;
 * LLM_MODELE le modèle. C'est le SEUL endroit qui connaît les adaptateurs :
 * changer de fournisseur ne touche aucun module métier. Sans clé, `anthropic`
 * est refusé au démarrage ; sans URL, `compatible-openai` aussi.
 */
export const llmProvider: Provider = {
  provide: FOURNISSEUR_LLM,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): FournisseurLlm => {
    const config = configService.getOrThrow<LlmConfig>('llm');
    // US-IA-09 : dire au démarrage quel fournisseur répond vraiment.
    const journal = new Logger('FournisseurLlm');
    if (config.fournisseur === 'non-configure') {
      journal.warn('Aucun fournisseur d’IA configuré : ajoutez ANTHROPIC_API_KEY dans .env.');
    } else {
      journal.log(`Fournisseur d’IA : ${config.fournisseur} (${config.modele}).`);
    }
    if (config.fournisseur === 'anthropic') {
      return new LlmAnthropic(config.cleAnthropic as string, config.modele);
    }
    if (config.fournisseur === 'compatible-openai') {
      return new LlmCompatibleOpenAi(config.urlCompatible as string, config.modele, config.cle);
    }
    if (config.fournisseur === 'factice') return new LlmFactice();
    return new LlmNonConfigure();
  },
};

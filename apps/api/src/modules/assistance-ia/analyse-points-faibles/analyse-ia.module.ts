import { Module } from '@nestjs/common';
import { embeddingsProvider } from '../embeddings/embeddings.provider';
import { llmProvider } from '../llm/llm.provider';
import { AnalysePointsFaiblesService } from './analyse-points-faibles.service';

/**
 * US-IA-10 — Analyse des points faibles par l'IA, partagée par les rapports
 * (rapport de tentative US-QCM-13, rapport de session US-RPT-01). Mêmes
 * fabriques que l'assistance IA : fournisseur de langage et d'embeddings.
 */
@Module({
  providers: [AnalysePointsFaiblesService, llmProvider, embeddingsProvider],
  exports: [AnalysePointsFaiblesService],
})
export class AnalyseIaModule {}

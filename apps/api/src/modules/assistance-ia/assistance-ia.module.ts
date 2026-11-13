import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationIa } from '../../database/entities/generation-ia.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { SuggestionQuestionIa } from '../../database/entities/suggestion-question-ia.entity';
import { SupportPedagogique } from '../../database/entities/support-pedagogique.entity';
import { FormationsModule } from '../formations/formations.module';
import { QcmModule } from '../qcm/qcm.module';
import { ExtractionQuestionsController } from './extraction-questions/extraction-questions.controller';
import { ExtractionQuestionsService } from './extraction-questions/extraction-questions.service';
import { embeddingsProvider } from './embeddings/embeddings.provider';
import { FileIaService } from './file-ia.service';
import { GenerationsController } from './generations/generations.controller';
import { GenerationsService } from './generations/generations.service';
import { PipelineRagService } from './generations/pipeline-rag.service';
import { llmProvider } from './llm/llm.provider';
import { RevisionSuggestionsController } from './suggestions/revision-suggestions.controller';
import { RevisionSuggestionsService } from './suggestions/revision-suggestions.service';
import { SupportsController } from './supports/supports.controller';
import { SupportsService } from './supports/supports.service';
import { SuiviTempsReelController } from './suivi/suivi-temps-reel.controller';
import { SuiviTempsReelService } from './suivi/suivi-temps-reel.service';
import { TracabiliteGenerationsController } from './tracabilite/tracabilite-generations.controller';
import { TracabiliteGenerationsService } from './tracabilite/tracabilite-generations.service';

/**
 * Assistance IA aux formateurs (E6, F4 ; DS-06, AC-04, ADR-04 / ADR-05).
 *
 * US-IA-01 : dépôt et indexation des supports pédagogiques — stockage MinIO
 * (StockageService, @Global), extraction du texte, découpage, embeddings
 * (fournisseur interchangeable, FOURNISSEUR_EMBEDDINGS), vecteurs dans
 * pgvector, file BullMQ `ia-indexation` avec worker dans le processus de
 * l'api.
 *
 * US-IA-02 : lancement d'une génération paramétrée (GenerationsService) —
 * génération EN_COURS, travail dans la file `ia-generation`, une génération
 * en cours par formateur, plafond horaire (Redis).
 *
 * US-IA-03 : pipeline RAG (PipelineRagService, worker de `ia-generation`) —
 * recherche des passages proches dans pgvector, fournisseur de LLM
 * interchangeable (FOURNISSEUR_LLM : Anthropic ou factice), validation,
 * suggestions PROPOSEE.
 *
 * US-IA-04 : révision humaine (RevisionSuggestionsService) — accepter (telle
 * quelle ou modifiée, vers un QCM du module, via QcmService) ou rejeter.
 *
 * US-IA-08 : extraction des questions d'un document (ExtractionQuestionsService,
 * worker de `ia-extraction`) et leur revue (accepter, rejeter, tout accepter).
 *
 * Importe FormationsModule : le garde @FormateurDeLaFormation et
 * FormationsService (formation archivée -> 409).
 */
@Module({
  imports: [
    FormationsModule,
    QcmModule,
    TypeOrmModule.forFeature([
      SupportPedagogique,
      ModuleFormation,
      GenerationIa,
      SuggestionQuestionIa,
    ]),
  ],
  controllers: [
    SupportsController,
    GenerationsController,
    RevisionSuggestionsController,
    TracabiliteGenerationsController,
    SuiviTempsReelController,
    ExtractionQuestionsController,
  ],
  providers: [
    SupportsService,
    GenerationsService,
    PipelineRagService,
    RevisionSuggestionsService,
    TracabiliteGenerationsService,
    SuiviTempsReelService,
    ExtractionQuestionsService,
    FileIaService,
    embeddingsProvider,
    llmProvider,
  ],
})
export class AssistanceIaModule {}

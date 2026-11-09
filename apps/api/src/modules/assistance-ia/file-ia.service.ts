import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { IaConfig, RedisConfig } from '../../config/configuration';

/** File et travail d'indexation (DS-06 : « indexer-support »). */
export const FILE_IA_INDEXATION = 'ia-indexation';
export const TRAVAIL_INDEXER = 'indexer-support';

/** File et travail de génération (DS-06 : « generer-questions », US-IA-02). */
export const FILE_IA_GENERATION = 'ia-generation';
export const TRAVAIL_GENERER = 'generer-questions';

export interface DonneesGeneration {
  generationId: string;
}

export interface DonneesIndexation {
  supportId: string;
}

/** Ce que fait le worker, fourni par SupportsService. */
export interface TraitementsIndexation {
  indexer(supportId: string): Promise<void>;
  echecDefinitif(supportId: string, erreur: unknown): Promise<void>;
}

/**
 * Files de l'assistance IA (US-IA-01, ADR-04) : BullMQ sur le Redis existant,
 * sur le modèle de la file des certificats.
 *
 *  - Identifiant de travail = identifiant du support (+ suffixe de relance) :
 *    un second ajout du même identifiant est ignoré -> un seul travail.
 *  - Reprises : IA_TENTATIVES essais, délai exponentiel (IA_BACKOFF_MS, ×2) —
 *    pour les pannes passagères (stockage, base).
 *  - Contenu en cause (UnrecoverableError) : échec immédiat, sans reprise.
 *  - Après le dernier échec : `echecDefinitif` (statut ECHEC_INDEXATION).
 *  - Worker dans le processus de l'api (IA_WORKER=on), un travail à la fois :
 *    l'extraction et la vectorisation consomment du processeur.
 */
@Injectable()
export class FileIaService implements OnModuleDestroy {
  private readonly logger = new Logger(FileIaService.name);
  private readonly fileIndexation: Queue<DonneesIndexation>;
  private readonly fileGeneration: Queue<DonneesGeneration>;
  private workerIndexation: Worker<DonneesIndexation> | null = null;
  private readonly config: IaConfig;
  private readonly connexion: { host: string; port: number; maxRetriesPerRequest: null };

  constructor(configService: ConfigService) {
    const { host, port } = configService.getOrThrow<RedisConfig>('redis');
    this.config = configService.getOrThrow<IaConfig>('ia');
    this.connexion = { host, port, maxRetriesPerRequest: null };
    this.fileIndexation = new Queue<DonneesIndexation>(FILE_IA_INDEXATION, {
      connection: this.connexion,
    });
    this.fileGeneration = new Queue<DonneesGeneration>(FILE_IA_GENERATION, {
      connection: this.connexion,
    });
  }

  /**
   * Ajoute le travail de génération (US-IA-02) ; identifiant de travail =
   * identifiant de la génération : un seul travail par génération. Le worker
   * qui l'exécute (pipeline RAG) est celui d'US-IA-03.
   */
  async ajouterGeneration(generationId: string): Promise<void> {
    await this.fileGeneration.add(
      TRAVAIL_GENERER,
      { generationId },
      {
        jobId: generationId,
        attempts: this.config.tentatives,
        backoff: { type: 'exponential', delay: this.config.backoffMs },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  /** Le travail d'une génération, s'il est encore dans la file (tests, suivi). */
  async travailGeneration(
    generationId: string,
  ): Promise<{ id: string; donnees: DonneesGeneration } | null> {
    const travail = await this.fileGeneration.getJob(generationId);
    return travail ? { id: travail.id as string, donnees: travail.data } : null;
  }

  /** Ajoute le travail d'indexation ; `suffixe` distingue une relance. */
  async ajouterIndexation(supportId: string, suffixe?: string): Promise<void> {
    await this.fileIndexation.add(
      TRAVAIL_INDEXER,
      { supportId },
      {
        jobId: suffixe ? `${supportId}-${suffixe}` : supportId,
        attempts: this.config.tentatives,
        backoff: { type: 'exponential', delay: this.config.backoffMs },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  /** Démarre le worker d'indexation (une fois), si la configuration le permet. */
  demarrerWorkerIndexation(traitements: TraitementsIndexation): void {
    if (!this.config.workerActif || this.workerIndexation) return;
    this.workerIndexation = new Worker<DonneesIndexation>(
      FILE_IA_INDEXATION,
      async (job: Job<DonneesIndexation>) => traitements.indexer(job.data.supportId),
      { connection: this.connexion, concurrency: 1 },
    );
    this.workerIndexation.on('failed', (job, erreur) => {
      if (!job) return;
      const dernier =
        erreur instanceof UnrecoverableError ||
        erreur?.name === 'UnrecoverableError' ||
        job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger.warn(
        `Indexation du support ${job.data.supportId} : échec ${job.attemptsMade}/${job.opts.attempts ?? 1} (${erreur.message})`,
      );
      if (dernier) {
        void traitements.echecDefinitif(job.data.supportId, erreur).catch((e: unknown) => {
          const detail = e instanceof Error ? e.message : String(e);
          this.logger.error(
            `Échec d'indexation non enregistré (${job.data.supportId}) : ${detail}`,
          );
        });
      }
    });
    this.workerIndexation.on('error', (erreur) =>
      this.logger.error(`Worker d'indexation : ${erreur.message}`),
    );
    this.logger.log('Worker d’indexation des supports démarré.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.workerIndexation?.close();
    await this.fileIndexation.close();
    await this.fileGeneration.close();
  }
}

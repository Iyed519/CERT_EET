import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { RapportsConfig, RedisConfig } from '../../config/configuration';

/** Nom de la file et du travail (DS-14 P3 : « generer-rapport »). */
export const FILE_RAPPORTS = 'rapports';
export const TRAVAIL_GENERER_RAPPORT = 'generer-rapport';

/** Données d'un travail : l'identifiant suffit, le worker relit la base. */
export interface DonneesTravailRapport {
  rapportId: string;
}

/** Ce que fait le worker, fourni par RapportsService. */
export interface TraitementsRapport {
  generer(rapportId: string): Promise<void>;
  echecDefinitif(rapportId: string, erreur: unknown): Promise<void>;
}

/**
 * File de génération des rapports exportés (US-RPT-01, ADR-04) : BullMQ sur
 * le Redis existant, sur le modèle de la file des certificats.
 *
 *  - La requête ne fait qu'AJOUTER un travail (202) ; le worker produit le
 *    fichier à part.
 *  - Identifiant de travail = identifiant du rapport : un second ajout est
 *    ignoré par BullMQ.
 *  - Reprises : `tentatives` essais, délai exponentiel (`backoffMs`, ×2) ;
 *    après le dernier échec, `echecDefinitif` (statut ECHEC, audit).
 *  - Worker dans le processus de l'api (RAPPORTS_WORKER=on), un travail à
 *    la fois ; « off » le coupe sans toucher à la file.
 */
@Injectable()
export class FileRapportsService implements OnModuleDestroy {
  private readonly logger = new Logger(FileRapportsService.name);
  private readonly file: Queue<DonneesTravailRapport>;
  private worker: Worker<DonneesTravailRapport> | null = null;
  private readonly config: RapportsConfig;
  private readonly connexion: { host: string; port: number; maxRetriesPerRequest: null };

  constructor(configService: ConfigService) {
    const { host, port } = configService.getOrThrow<RedisConfig>('redis');
    this.config = configService.getOrThrow<RapportsConfig>('rapports');
    this.connexion = { host, port, maxRetriesPerRequest: null };
    this.file = new Queue<DonneesTravailRapport>(FILE_RAPPORTS, { connection: this.connexion });
  }

  /** Ajoute le travail de génération d'un rapport. */
  async ajouter(rapportId: string): Promise<void> {
    await this.file.add(
      TRAVAIL_GENERER_RAPPORT,
      { rapportId },
      {
        jobId: rapportId,
        attempts: this.config.tentatives,
        backoff: { type: 'exponential', delay: this.config.backoffMs },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  /** Démarre le worker (une fois), si la configuration le permet. */
  demarrerWorker(traitements: TraitementsRapport): void {
    if (!this.config.workerActif || this.worker) return;
    this.worker = new Worker<DonneesTravailRapport>(
      FILE_RAPPORTS,
      async (job: Job<DonneesTravailRapport>) => traitements.generer(job.data.rapportId),
      { connection: this.connexion, concurrency: 1 },
    );
    this.worker.on('failed', (job, erreur) => {
      if (!job) return;
      const dernier = job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger.warn(
        `Génération du rapport ${job.data.rapportId} : échec ${job.attemptsMade}/${job.opts.attempts ?? 1} (${erreur.message})`,
      );
      if (dernier) {
        void traitements.echecDefinitif(job.data.rapportId, erreur).catch((e: unknown) => {
          const detail = e instanceof Error ? e.message : String(e);
          this.logger.error(`Échec définitif non enregistré (${job.data.rapportId}) : ${detail}`);
        });
      }
    });
    this.worker.on('error', (erreur) => this.logger.error(`Worker rapports : ${erreur.message}`));
    this.logger.log('Worker des rapports démarré.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file.close();
  }
}

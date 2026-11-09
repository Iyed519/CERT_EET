import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { CertificatsConfig, RedisConfig } from '../../config/configuration';

/** Nom de la file et du travail (DS-04 : « generer-certificat »). */
export const FILE_CERTIFICATS = 'certificats';
export const TRAVAIL_GENERER = 'generer-certificat';

/** Données d'un travail : l'identifiant suffit, le worker relit la base. */
export interface DonneesTravail {
  certificatId: string;
}

/** Ce que fait le worker, fourni par CertificatsService. */
export interface Traitements {
  generer(certificatId: string): Promise<void>;
  echecDefinitif(certificatId: string, erreur: unknown): Promise<void>;
}

/**
 * File d'émission des certificats (US-CERT-01, ADR-04) : BullMQ sur le Redis
 * existant. La requête qui demande un certificat ne fait qu'AJOUTER un travail
 * et rend la main ; le worker génère le PDF à part.
 *
 *  - Identifiant de travail = identifiant du certificat (+ rang de relance) :
 *    BullMQ ignore un second ajout du même identifiant -> un seul travail.
 *  - Reprises : `tentatives` essais, délai exponentiel (`backoffMs`, ×2).
 *  - Après le dernier échec : `echecDefinitif` (statut remis en attente pour
 *    une relance manuelle, audit CERTIFICAT_ECHEC).
 *  - Le worker tourne dans le processus de l'api (CERTIFICATS_WORKER=on),
 *    un travail à la fois ; « off » le coupe sans toucher à la file.
 *  - Connexions BullMQ dédiées (maxRetriesPerRequest: null, exigé pour un
 *    worker), fermées à l'arrêt de l'application.
 */
@Injectable()
export class FileCertificatsService implements OnModuleDestroy {
  private readonly logger = new Logger(FileCertificatsService.name);
  private readonly file: Queue<DonneesTravail>;
  private worker: Worker<DonneesTravail> | null = null;
  private readonly config: CertificatsConfig;
  private readonly connexion: { host: string; port: number; maxRetriesPerRequest: null };

  constructor(configService: ConfigService) {
    const { host, port } = configService.getOrThrow<RedisConfig>('redis');
    this.config = configService.getOrThrow<CertificatsConfig>('certificats');
    this.connexion = { host, port, maxRetriesPerRequest: null };
    this.file = new Queue<DonneesTravail>(FILE_CERTIFICATS, { connection: this.connexion });
  }

  /** Ajoute le travail de génération ; `rang` > 0 pour une relance manuelle. */
  async ajouter(certificatId: string, rang = 0): Promise<void> {
    await this.file.add(
      TRAVAIL_GENERER,
      { certificatId },
      {
        jobId: rang === 0 ? certificatId : `${certificatId}-r${rang}`,
        attempts: this.config.tentatives,
        backoff: { type: 'exponential', delay: this.config.backoffMs },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  /** Démarre le worker (une fois), si la configuration le permet. */
  demarrerWorker(traitements: Traitements): void {
    if (!this.config.workerActif || this.worker) return;
    this.worker = new Worker<DonneesTravail>(
      FILE_CERTIFICATS,
      async (job: Job<DonneesTravail>) => traitements.generer(job.data.certificatId),
      { connection: this.connexion, concurrency: 1 },
    );
    this.worker.on('failed', (job, erreur) => {
      if (!job) return;
      const dernier = job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger.warn(
        `Génération du certificat ${job.data.certificatId} : échec ${job.attemptsMade}/${job.opts.attempts ?? 1} (${erreur.message})`,
      );
      if (dernier) {
        void traitements.echecDefinitif(job.data.certificatId, erreur).catch((e: unknown) => {
          const detail = e instanceof Error ? e.message : String(e);
          this.logger.error(
            `Échec définitif non enregistré (${job.data.certificatId}) : ${detail}`,
          );
        });
      }
    });
    this.worker.on('error', (erreur) =>
      this.logger.error(`Worker certificats : ${erreur.message}`),
    );
    this.logger.log('Worker des certificats démarré.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file.close();
  }
}

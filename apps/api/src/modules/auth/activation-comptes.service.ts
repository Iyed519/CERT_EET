import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ActivationsConfig, MailConfig, RedisConfig } from '../../config/configuration';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { JetonsLienService } from './jetons-lien.service';

/** Nom de la file et du travail d'envoi des emails d'activation. */
export const FILE_ACTIVATIONS = 'activations-comptes';
export const TRAVAIL_ENVOYER_ACTIVATION = 'envoyer-activation';
/** Lien d'activation valable 48 h (backlog US-CPT-01 / US-AUTH-05). */
export const ACTIVATION_DUREE_SECONDES = 48 * 3600;
export const MESSAGE_ACTIVATION_INVALIDE =
  "Lien d'activation invalide, expiré ou déjà utilisé. Demandez un nouveau lien à un administrateur.";

interface DonneesActivation {
  userId: string;
}

interface LigneCompte {
  id: string;
  email: string;
  prenom: string | null;
  statut: StatutCompte;
  mot_de_passe_hash: string | null;
}

/**
 * US-CPT-02 — Activation des comptes créés par l'administrateur (import CSV).
 *
 * - `planifier` : après la création (COMMIT), un travail BullMQ par compte ;
 *   le travail ne porte QUE l'identifiant (aucun jeton dans Redis).
 * - Le worker émet le jeton d'activation (primitive d'US-AUTH-06, objet
 *   ACTIVATION_COMPTE, 48 h, empreinte seule en base) au moment de l'envoi
 *   et envoie l'email ; reprises à délai exponentiel. Un compte déjà activé
 *   (ou désormais pourvu d'un mot de passe) est ignoré.
 * - `activer` : consommation atomique du jeton, mot de passe défini, compte
 *   ACTIF, audit COMPTE_ACTIVE.
 */
@Injectable()
export class ActivationComptesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ActivationComptesService.name);
  private readonly config: ActivationsConfig;
  private readonly connexion: { host: string; port: number; maxRetriesPerRequest: null };
  private readonly file: Queue<DonneesActivation>;
  private worker: Worker<DonneesActivation> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly jetons: JetonsLienService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {
    const { host, port } = configService.getOrThrow<RedisConfig>('redis');
    this.config = configService.getOrThrow<ActivationsConfig>('activations');
    this.connexion = { host, port, maxRetriesPerRequest: null };
    this.file = new Queue<DonneesActivation>(FILE_ACTIVATIONS, { connection: this.connexion });
  }

  onApplicationBootstrap(): void {
    if (!this.config.workerActif || this.worker) return;
    this.worker = new Worker<DonneesActivation>(
      FILE_ACTIVATIONS,
      async (job: Job<DonneesActivation>) => this.envoyer(job.data.userId),
      { connection: this.connexion, concurrency: 2 },
    );
    this.worker.on('failed', (job, erreur) => {
      if (job) {
        this.logger.warn(
          `Email d'activation (${job.data.userId}) : échec ${job.attemptsMade}/${job.opts.attempts ?? 1} (${erreur.message})`,
        );
      }
    });
    this.worker.on('error', (erreur) =>
      this.logger.error(`Worker activations : ${erreur.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.file.close();
  }

  /** Met en file l'envoi des emails d'activation (un travail par compte). */
  async planifier(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.file.addBulk(
      userIds.map((userId) => ({
        name: TRAVAIL_ENVOYER_ACTIVATION,
        data: { userId },
        opts: {
          attempts: this.config.tentatives,
          backoff: { type: 'exponential', delay: this.config.backoffMs },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      })),
    );
  }

  /** Travail du worker : jeton émis à l'envoi, puis email. */
  async envoyer(userId: string): Promise<void> {
    const lignes = (await this.dataSource.query(
      `SELECT id, email, prenom, statut, mot_de_passe_hash FROM users WHERE id = $1`,
      [userId],
    )) as LigneCompte[];
    const compte = lignes[0];
    if (
      !compte ||
      compte.statut !== StatutCompte.EN_ATTENTE_ACTIVATION ||
      compte.mot_de_passe_hash !== null
    ) {
      return;
    }
    const jeton = await this.jetons.emettre(
      compte.id,
      'ACTIVATION_COMPTE',
      ACTIVATION_DUREE_SECONDES,
    );
    const { appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    await this.mailService.sendActivationCompteEmail(compte.email, {
      prenom: compte.prenom,
      lien: `${appBaseUrl}/activer-compte?token=${encodeURIComponent(jeton)}`,
      heures: ACTIVATION_DUREE_SECONDES / 3600,
    });
  }

  /** Activation par le lien : mot de passe défini, compte ACTIF. */
  async activer(
    jeton: string,
    motDePasse: string,
    context: { adresseIp: string | null },
  ): Promise<void> {
    const hash = await bcrypt.hash(motDePasse, 12);
    const compte = await this.dataSource.transaction(async (em) => {
      const userId = await this.jetons.consommer(jeton, 'ACTIVATION_COMPTE', em);
      if (!userId) return null;
      const lignes = (await em.query(
        `SELECT id, email, prenom, statut, mot_de_passe_hash FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      )) as LigneCompte[];
      const ligne = lignes[0];
      if (!ligne || ligne.statut !== StatutCompte.EN_ATTENTE_ACTIVATION) return null;
      await em.query(
        `UPDATE users SET mot_de_passe_hash = $2, statut = $3, updated_at = now() WHERE id = $1`,
        [ligne.id, hash, StatutCompte.ACTIF],
      );
      return ligne;
    });
    if (!compte) {
      await this.auditService.record({
        action: 'COMPTE_ACTIVE',
        acteur: null,
        adresseIp: context.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { motif: 'Lien invalide, expiré ou déjà utilisé' },
      });
      throw new BadRequestException(MESSAGE_ACTIVATION_INVALIDE);
    }
    await this.auditService.record({
      action: 'COMPTE_ACTIVE',
      acteur: compte.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
  }
}

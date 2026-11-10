import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertesConfig, AppConfig } from '../../config/configuration';
import { AlertesDecrochageService } from './alertes-decrochage.service';

/**
 * US-SUIVI-02 — Minuteur du balayage des alertes de décrochage (DS-14 P2,
 * « [CRON] Analyse activité »). Même principe que le balayage des tentatives
 * (US-QCM-07) : un setInterval sans dépendance, désactivé en test et par
 * ALERTES_BALAYAGE_ACTIF=false ; jamais deux balayages simultanés dans une
 * instance (plusieurs instances restent sûres : index unique partiel).
 */
@Injectable()
export class AlertesBalayageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertesBalayageService.name);
  private minuteur: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly alertes: AlertesDecrochageService,
  ) {}

  onModuleInit(): void {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    const config = this.configService.getOrThrow<AlertesConfig>('alertes');
    if (!config.balayageActif || nodeEnv === 'test') {
      this.logger.log('Balayage des alertes de décrochage désactivé.');
      return;
    }
    this.minuteur = setInterval(() => void this.tourner(), config.intervalleMinutes * 60_000);
    this.minuteur.unref();
    this.logger.log(
      `Balayage des alertes de décrochage toutes les ${config.intervalleMinutes} min.`,
    );
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  /** Un tour : ignoré si le précédent n'est pas fini ; une erreur est journalisée. */
  async tourner(): Promise<number> {
    if (this.enCours) return 0;
    this.enCours = true;
    try {
      const creees = await this.alertes.balayer();
      if (creees.length > 0) this.logger.log(`${creees.length} alerte(s) de décrochage créée(s).`);
      return creees.length;
    } catch (erreur) {
      this.logger.error(`Balayage des alertes en échec : ${String(erreur)}`);
      return 0;
    } finally {
      this.enCours = false;
    }
  }
}

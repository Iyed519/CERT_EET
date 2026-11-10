import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { REPRISE_CERTIFICATS } from './certificat.regles';
import { CertificatsService } from './certificats.service';

/**
 * US-CERT-02 — Minuteur de reprise des certificats bloqués en génération
 * (worker arrêté en cours de route). Même principe que les autres balayages :
 * un setInterval sans dépendance, désactivé en test ; jamais deux tours
 * simultanés dans une instance (plusieurs instances restent sûres : UPDATE
 * conditionnel).
 */
@Injectable()
export class RepriseCertificatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RepriseCertificatsService.name);
  private minuteur: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly certificats: CertificatsService,
  ) {}

  onModuleInit(): void {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    if (nodeEnv === 'test') return;
    this.minuteur = setInterval(
      () => void this.tourner(),
      REPRISE_CERTIFICATS.intervalleMinutes * 60_000,
    );
    this.minuteur.unref();
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
      const repris = await this.certificats.reprendreBloques();
      if (repris.length > 0) this.logger.warn(`${repris.length} certificat(s) bloqué(s) repris.`);
      return repris.length;
    } catch (erreur) {
      this.logger.error(`Reprise des certificats en échec : ${String(erreur)}`);
      return 0;
    } finally {
      this.enCours = false;
    }
  }
}

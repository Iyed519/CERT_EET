import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { EXPIRATION_CERTIFICATS } from './certificat.regles';
import { CertificatsService } from './certificats.service';

/**
 * US-CERT-07 — Minuteur de l'expiration des certificats échus (même principe
 * que les autres balayages : setInterval sans dépendance, désactivé en test,
 * jamais deux tours simultanés dans une instance ; plusieurs instances restent
 * sûres : UPDATE conditionnel).
 */
@Injectable()
export class ExpirationCertificatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirationCertificatsService.name);
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
      EXPIRATION_CERTIFICATS.intervalleMinutes * 60_000,
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
      const expires = await this.certificats.expirerEchus();
      if (expires.length > 0) this.logger.log(`${expires.length} certificat(s) expiré(s).`);
      return expires.length;
    } catch (erreur) {
      this.logger.error(`Expiration des certificats en échec : ${String(erreur)}`);
      return 0;
    } finally {
      this.enCours = false;
    }
  }
}

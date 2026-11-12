import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, RisqueConfig } from '../../config/configuration';
import { BilanCalcul, PredictionRisqueService } from './prediction-risque.service';

/**
 * IA — Minuteur du calcul des scores de risque. Même mécanisme que le
 * balayage des alertes de décrochage (`alertes-balayage.service.ts`) : un
 * setInterval sans dépendance, désactivé en test et par
 * RISQUE_BALAYAGE_ACTIF=false ; jamais deux calculs simultanés dans une
 * instance. Un premier calcul a lieu peu après le démarrage
 * (`RISQUE_PREMIER_CALCUL_SECONDES`), puis toutes les
 * `RISQUE_INTERVALLE_MINUTES`. Le calcul n'a jamais lieu pendant une requête
 * d'un utilisateur, et une erreur est seulement journalisée.
 */
@Injectable()
export class PredictionRisqueBalayageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PredictionRisqueBalayageService.name);
  private minuteur: NodeJS.Timeout | null = null;
  private premier: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prediction: PredictionRisqueService,
  ) {}

  onModuleInit(): void {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    const config = this.configService.getOrThrow<RisqueConfig>('risque');
    if (!config.balayageActif || nodeEnv === 'test') {
      this.logger.log('Calcul des scores de risque désactivé.');
      return;
    }
    this.premier = setTimeout(() => void this.tourner(), config.premierCalculSecondes * 1000);
    this.premier.unref();
    this.minuteur = setInterval(() => void this.tourner(), config.intervalleMinutes * 60_000);
    this.minuteur.unref();
    this.logger.log(`Calcul des scores de risque toutes les ${config.intervalleMinutes} min.`);
  }

  onModuleDestroy(): void {
    if (this.premier) clearTimeout(this.premier);
    if (this.minuteur) clearInterval(this.minuteur);
    this.premier = null;
    this.minuteur = null;
  }

  /** Un tour : ignoré si le précédent n'est pas fini ; une erreur est journalisée. */
  async tourner(): Promise<BilanCalcul | null> {
    if (this.enCours) return null;
    this.enCours = true;
    try {
      const bilan = await this.prediction.calculer();
      if (bilan.serviceDisponible && bilan.enregistres > 0) {
        this.logger.log(`${bilan.enregistres} score(s) de risque enregistré(s).`);
      }
      return bilan;
    } catch (erreur) {
      this.logger.error(`Calcul des scores de risque en échec : ${String(erreur)}`);
      return null;
    } finally {
      this.enCours = false;
    }
  }
}

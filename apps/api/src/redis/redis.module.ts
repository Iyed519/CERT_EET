import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '../config/configuration';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * Module Redis (US-AUTH-03) — PREMIER branchement réel de Redis dans l'app.
 *
 * Jusqu'ici Redis tournait en conteneur (INF03) mais aucun code NestJS ne s'y
 * connectait. Cette story l'exige (denylist des jetons). Même logique que
 * DatabaseModule : une seule connexion partagée, ouverte au démarrage.
 *
 * @Global : la connexion est un singleton d'infrastructure, utile partout
 * (auth maintenant, logout et cache plus tard) — on évite de réimporter ce
 * module dans chaque module métier, exactement comme ConfigModule.
 */
@Global()
@Module({
  providers: [
    {
      // Provider "factory" : le client Redis vient de la lib ioredis, pas
      // d'une classe à nous — on le fabrique donc à la main à partir de la
      // config validée, et on l'expose sous le jeton REDIS_CLIENT.
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const { host, port } = configService.getOrThrow<RedisConfig>('redis');
        const logger = new Logger('RedisClient');

        const client = new Redis({ host, port });

        // ioredis gère seul les reconnexions ; on se contente de tracer les
        // événements pour avoir une confirmation visible au boot et ne pas
        // laisser une erreur de connexion filer en "unhandled".
        client.on('connect', () =>
          logger.log(`Connecté à Redis (${host}:${port})`),
        );
        client.on('error', (err) =>
          logger.error(`Erreur Redis : ${err.message}`),
        );

        return client;
      },
    },
    RedisService,
  ],
  // On exporte les deux : RedisService pour l'usage courant (méthodes
  // lisibles), et le client brut REDIS_CLIENT au cas où un besoin avancé
  // (pipeline, commande non wrappée) se présenterait plus tard.
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
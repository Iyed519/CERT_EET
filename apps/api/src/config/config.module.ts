import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { envValidationSchema } from './env.validation';

/**
 * Module de configuration global.
 *
 * - Charge .env (hors production où l'injection se fait par variables
 *   d'environnement / secrets Docker — cf. ADR-07 / INF07).
 * - Valide l'environnement via Joi au démarrage : abortEarly=false pour
 *   remonter toutes les erreurs d'un coup ; un échec stoppe le boot (fail-fast).
 * - @Global : ConfigService est injectable partout sans réimport.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      envFilePath: ['.env'],
    }),
  ],
})
export class ConfigModule {}

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

/**
 * Point d'entrée de l'API (bootstrap).
 *
 * Fail-fast : la validation Joi du ConfigModule s'exécute pendant
 * NestFactory.create ; toute variable requise manquante ou invalide lève une
 * exception ici et arrête le process avec un code de sortie non nul, plutôt
 * que de démarrer un serveur à moitié configuré (US-INFRA-02, scénario erreur).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(ConfigService);
  const app_ = config.getOrThrow<AppConfig>('app');

  // Préfixe global : le reverse proxy Nginx routera /api -> api (INF03).
  app.setGlobalPrefix(app_.apiPrefix, { exclude: ['health'] });

  // Validation stricte de toutes les entrées (DTOs) côté API.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({ origin: app_.corsOrigin, credentials: true });

  // OpenAPI/Swagger (US-INFRA-08) — exposé dès maintenant pour l'onboarding.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cert_EET API')
    .setDescription('API de la plateforme de certification numérique vérifiable')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${app_.apiPrefix}/docs`, app, document);

  await app.listen(app_.port);
  logger.log(`API démarrée sur le port ${app_.port} (env: ${app_.nodeEnv})`);
  logger.log(`Health: GET /health · Docs: GET /${app_.apiPrefix}/docs`);
}

void bootstrap().catch((err) => {
  // Fail-fast explicite : on n'avale pas l'erreur de démarrage.
  // eslint-disable-next-line no-console
  console.error('Échec du démarrage de l’API (fail-fast):', err);
  process.exit(1);
});

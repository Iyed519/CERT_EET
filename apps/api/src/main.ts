import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

/**
 * Point d'entrée de l'API (bootstrap).
 *
 * Fail-fast : la validation Joi du ConfigModule s'exécute pendant
 * NestFactory.create ; toute variable requise manquante ou invalide lève une
 * exception ici et arrête le process (US-INFRA-02, scénario erreur).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const app_ = config.getOrThrow<AppConfig>('app');

  // Préfixe global : le reverse proxy Nginx routera /api -> api (INF03).
  app.setGlobalPrefix(app_.apiPrefix, { exclude: ['health'] });

  // US-AUTH-03 : lecture des cookies entrants. cookie-parser peuple req.cookies
  // pour que POST /auth/refresh puisse lire le refresh token déposé en cookie
  // httpOnly au login. Sans ce middleware, req.cookies serait undefined.
  app.use(cookieParser());

  // Validation stricte de toutes les entrées (DTOs).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({ origin: app_.corsOrigin, credentials: true });

  // OpenAPI/Swagger (US-INFRA-08).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cert_EET API')
    .setDescription('API de la plateforme de certification numérique vérifiable')
    .setVersion('0.1.0')
    .addTag('auth', "Authentification, MFA (TOTP), OAuth, profil et session")
    .addTag('admin', "Administration : comptes, rôles, demandes de rôle, formations, journal d'audit (ADMINISTRATEUR)")
    .addTag('formations', "Catalogue et détail des formations (utilisateur authentifié)")
    .addTag('formateur', "Espace formateur : mes formations affectées (FORMATEUR, autorisation par ressource)")
    .addTag('qcm', "Contenu des QCM : questions, options, bonnes réponses (FORMATEUR affecté, ADMINISTRATEUR)")
    .addTag('inscriptions', "Inscription aux formations, mes inscriptions et mon espace de formation (APPRENANT)")
    .addTag('role-requests', "Demandes de changement de rôle en self-service (utilisateur authentifié)")
    .addTag('referentiel', "Référentiels : domaines et établissements")
    .addTag('health', "Sonde de santé (Docker healthcheck, publique)")
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description:
          "Colle ici un access token JWT (obtenu via POST /auth/login puis /auth/mfa/verify si MFA). Applique-le aux routes protégées (cadenas).",
      },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${app_.apiPrefix}/docs`, app, document, {
    // persistAuthorization : conserve le token collé via « Authorize » entre
    // deux rafraîchissements de la page (confort de démo Sprint Review).
    swaggerOptions: { persistAuthorization: true },
    // Expose le contrat OpenAPI brut (smoke test : GET /api/docs-json -> 200).
    jsonDocumentUrl: `${app_.apiPrefix}/docs-json`,
  });

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

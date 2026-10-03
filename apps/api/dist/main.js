"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const cookieParser = require("cookie-parser");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: false });
    const config = app.get(config_1.ConfigService);
    const app_ = config.getOrThrow('app');
    app.setGlobalPrefix(app_.apiPrefix, { exclude: ['health'] });
    app.use(cookieParser());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.enableCors({ origin: app_.corsOrigin, credentials: true });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Cert_EET API')
        .setDescription('API de la plateforme de certification numérique vérifiable')
        .setVersion('0.1.0')
        .addTag('auth', "Authentification, MFA (TOTP), OAuth, profil et session")
        .addTag('admin', "Administration : comptes, rôles, demandes de rôle, journal d'audit (ADMINISTRATEUR)")
        .addTag('role-requests', "Demandes de changement de rôle en self-service (utilisateur authentifié)")
        .addTag('referentiel', "Référentiels : domaines et établissements")
        .addTag('health', "Sonde de santé (Docker healthcheck, publique)")
        .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: "Colle ici un access token JWT (obtenu via POST /auth/login puis /auth/mfa/verify si MFA). Applique-le aux routes protégées (cadenas).",
    }, 'access-token')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup(`${app_.apiPrefix}/docs`, app, document, {
        swaggerOptions: { persistAuthorization: true },
        jsonDocumentUrl: `${app_.apiPrefix}/docs-json`,
    });
    await app.listen(app_.port);
    logger.log(`API démarrée sur le port ${app_.port} (env: ${app_.nodeEnv})`);
    logger.log(`Health: GET /health · Docs: GET /${app_.apiPrefix}/docs`);
}
void bootstrap().catch((err) => {
    console.error('Échec du démarrage de l’API (fail-fast):', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
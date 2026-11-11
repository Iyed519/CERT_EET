import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from '../../config/configuration';

/**
 * US-AUTH-13 — Taille maximale des corps JSON et formulaires. Les dépôts de
 * fichiers (multipart) ne passent pas par ces analyseurs : chaque route de
 * dépôt garde ses propres limites (multer), et nginx borne le reste.
 */
export const LIMITE_CORPS_JSON = '100kb';
export const LIMITE_CORPS_FORMULAIRE = '20kb';

/**
 * US-AUTH-13 — Politique de sécurité du contenu des réponses de l'API. L'API
 * sert du JSON ; la seule page HTML est la documentation Swagger, qui a besoin
 * de scripts et de styles en ligne. Aucune ressource tierce, aucun cadre.
 */
export const CSP_API = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** Origines CORS autorisées : liste séparée par des virgules, sans « * ». */
export function originesCors(valeur: string): string[] {
  return valeur
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && o !== '*');
}

/**
 * Réglages HTTP communs de l'application, appliqués par `main.ts` et par les
 * tests e2e qui veulent l'application telle qu'en production : préfixe,
 * cookies, proxies de confiance, en-têtes de sécurité (helmet), tailles de
 * corps, validation stricte, CORS.
 */
export function configurerApplication(app: NestExpressApplication, config: ConfigService): void {
  const appConfig = config.getOrThrow<AppConfig>('app');

  // Préfixe global : le reverse proxy Nginx route /api -> api (INF03).
  app.setGlobalPrefix(appConfig.apiPrefix, { exclude: ['health'] });

  // US-AUTH-03 : lecture du cookie httpOnly du refresh token.
  app.use(cookieParser());

  // US-CERT-05 — derrière nginx, l'IP du visiteur vient de X-Forwarded-For :
  // seuls les proxies des réseaux privés sont crus (TRUST_PROXY).
  app.set('trust proxy', config.getOrThrow<string>('TRUST_PROXY'));

  // US-AUTH-13 — en-têtes de sécurité : HSTS (2 ans, sous-domaines),
  // nosniff, refus d'affichage dans un cadre, pas de Referer vers l'extérieur,
  // CSP stricte, X-Powered-By retiré. CORP « same-site » : le frontend (même
  // site, derrière le même nginx) lit les fichiers servis par l'API.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: CSP_API },
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );

  // US-AUTH-13 — tailles de corps explicites : au-delà, 413.
  app.useBodyParser('json', { limit: LIMITE_CORPS_JSON });
  app.useBodyParser('urlencoded', { limit: LIMITE_CORPS_FORMULAIRE, extended: true });

  // Validation stricte de toutes les entrées (DTO).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // US-AUTH-13 — CORS : origines explicites seulement (cookies -> jamais
  // « * »), méthodes et en-têtes bornés.
  app.enableCors({
    origin: originesCors(appConfig.corsOrigin),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}

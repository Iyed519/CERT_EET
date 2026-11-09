import * as Joi from 'joi';
/**
 * Schéma de validation des variables d'environnement (fail-fast).
 *
 * Périmètre INF02 : socle applicatif uniquement. Les services externes
 * (DATABASE_URL, REDIS_URL) sont déclarés optionnels ici car leurs connexions
 * ne sont branchées qu'en INF03/INF04 ; ils deviendront `.required()` à ce
 * moment-là. Les secrets JWT/RS256 seront ajoutés et durcis en INF07.
 *
 * Règle (ADR-02 / US-INFRA-02) : toute variable requise manquante doit faire
 * échouer le démarrage immédiatement, avec un message clair, plutôt que de
 * laisser l'application démarrer partiellement.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'recette', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  // Origine(s) autorisée(s) pour CORS — le frontend Next.js en dev.
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
  // Prefixe global de l'API (le reverse proxy route /api -> api en INF03).
  API_PREFIX: Joi.string().default('api'),
// --- Base de données (branchée en INF04 — désormais requise) ---
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
// --- Redis : désormais requis (US-AUTH-03 : denylist des jetons révoqués) ---
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  JWT_PRIVATE_KEY_PATH: Joi.string().required(),
  JWT_PUBLIC_KEY_PATH: Joi.string().required(),
// --- Email / SMTP (US-CPT-05 : email de vérification d'adresse) ---
  // SMTP_HOST est requis : sans serveur SMTP, l'inscription ne peut pas
  // envoyer l'email de vérification. On échoue au démarrage plutôt que de
  // laisser une inscription se casser silencieusement à l'envoi.
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().default(1025),
  MAIL_FROM: Joi.string().default('Cert_EET <no-reply@cert-eet.local>'),
  // Base du frontend : sert à construire le lien de vérification (page Next.js).
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3001'),
// --- OAuth Google (US-AUTH-14 : connexion sociale) ---
  // Identifiants de la console Google. Requis (fail-fast) : la stratégie Google
  // est instanciée au démarrage. En CI, on fournit des valeurs factices.
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string()
    .uri()
    .default('https://localhost/api/auth/oauth/google/callback'),
// --- OAuth GitHub (US-AUTH-14 : 2e fournisseur) ---
  // Identifiants de l'OAuth App GitHub. Requis (fail-fast) : la stratégie GitHub
  // est instanciée au démarrage, comme Google. En CI, on fournit des valeurs factices.
  GITHUB_CLIENT_ID: Joi.string().required(),
  GITHUB_CLIENT_SECRET: Joi.string().required(),
  GITHUB_CALLBACK_URL: Joi.string()
    .uri()
    .default('https://localhost/api/auth/oauth/github/callback'),
// --- Minuterie des tentatives de QCM (US-QCM-07) ---
  // Balayage des tentatives échues (toutes les 60 s). Actif par défaut ;
  // toujours désactivé quand NODE_ENV=test.
  MINUTERIE_BALAYAGE_ACTIF: Joi.boolean().default(true),
// --- Stockage objet S3 / MinIO (US-ATEL-04, ADR-07) ---
  // Requis (fail-fast) : sans stockage, un livrable ne peut pas être déposé.
  // En dev, MinIO (service « minio ») ; en CI, un conteneur MinIO.
  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  // Nom de bucket S3 : 3 à 63 caractères, minuscules, chiffres, points, tirets.
  S3_BUCKET_LIVRABLES: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default('livrables'),

  // --- Certificats (US-CERT-01, ADR-04) ---
  // File Bull (BullMQ) sur le Redis existant. Le worker tourne dans le
  // processus de l'api (CERTIFICATS_WORKER=on) ; « off » le coupe (instance
  // dédiée à l'HTTP). Tentatives et délai de reprise (exponentiel) réglables.
  CERTIFICATS_WORKER: Joi.string().valid('on', 'off').default('on'),
  CERTIFICATS_TENTATIVES: Joi.number().integer().min(1).max(10).default(3),
  CERTIFICATS_BACKOFF_MS: Joi.number().integer().min(10).max(600000).default(5000),
})
  // Refuse les clés inconnues seulement en avertissement : on n'échoue pas
  // sur des variables système, mais on valide strictement celles qu'on connaît.
  .unknown(true);

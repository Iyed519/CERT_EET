/**
 * Fabrique de configuration typée.
 *
 * Centralise la lecture de process.env (déjà validé par Joi au chargement du
 * ConfigModule) et expose un objet de configuration fortement typé. Aucun
 * module métier ne lit process.env directement : ils passent par ConfigService
 * (Règle 3 / PKG-02 — tout dépend de config, config ne dépend de rien).
 */
export interface AppConfig {
  nodeEnv: 'development' | 'recette' | 'production' | 'test';
  port: number;
  corsOrigin: string;
  apiPrefix: string;
  databaseUrl?: string;
  redisUrl?: string;
}
export interface JwtConfig {
  privateKeyPath: string;
  publicKeyPath: string;
  /** En secondes, pas en minutes : @nestjs/jwt attend un nombre de
   *  secondes pour expiresIn quand ce n'est pas une chaîne au format
   *  spécifique de la lib "ms" (ex: '15m'). Un nombre lève toute
   *  ambiguïté de type ET de format. ADR-08 : 15 minutes = 900 s. */
  accessTokenExpiresIn: number;
  /** ADR-08 : 7 jours = 604800 s. */
  refreshTokenExpiresIn: number;
}
/**
 * Configuration de connexion Redis (US-AUTH-03).
 * Redis devient load-bearing à partir de cette story : il porte la denylist
 * des jetons révoqués (consultée à chaque refresh). On lit host + port
 * séparément (et non une URL) car le conteneur api reçoit REDIS_HOST=redis /
 * REDIS_PORT=6379 via docker-compose (réseau interne Docker).
 */
export interface RedisConfig {
  host: string;
  port: number;
}
/**
 * Configuration email / SMTP (US-CPT-05).
 * On lit host + port séparément (comme Redis) car le conteneur api reçoit
 * SMTP_HOST=mailhog / SMTP_PORT=1025 via docker-compose (réseau interne).
 * `from` = expéditeur affiché des emails ; `appBaseUrl` = base du FRONTEND,
 * utilisée pour construire le lien de vérification envoyé à l'inscrit.
 */
export interface MailConfig {
  host: string;
  port: number;
  from: string;
  appBaseUrl: string;
}
/**
 * Configuration OAuth Google (US-AUTH-14).
 * clientId / clientSecret viennent de la console Google (secrets, jamais
 * committés) ; callbackUrl = URL de redirection enregistrée chez Google, sur
 * l'origine Nginx (https://localhost) pour que le cookie de session soit
 * utilisable par le frontend après le retour de Google.
 */
export interface OauthGoogleConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
/**
 * Configuration OAuth GitHub (US-AUTH-14 — 2e fournisseur).
 * Même forme que Google : clientId / clientSecret viennent de l'OAuth App
 * GitHub (secrets, jamais committés) ; callbackUrl = URL de redirection
 * enregistrée chez GitHub, sur l'origine Nginx (https://localhost) pour que le
 * cookie de session soit utilisable par le frontend après le retour de GitHub.
 */
export interface OauthGithubConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
/**
 * Minuterie des tentatives de QCM (US-QCM-07).
 * Le balayage clôture toutes les `intervalleSecondes` les tentatives EN_COURS
 * échues depuis plus de `delaiGraceSecondes` (D2, D11). Désactivable par
 * MINUTERIE_BALAYAGE_ACTIF=false ; toujours désactivé en test (NODE_ENV=test).
 */
export interface MinuterieConfig {
  balayageActif: boolean;
  intervalleSecondes: number;
  delaiGraceSecondes: number;
}
/**
 * Stockage objet S3 / MinIO (US-ATEL-04, ADR-07) : livrables d'ateliers.
 * `forcePathStyle` : MinIO sert les buckets sous le chemin
 * (http://minio:9000/<bucket>/<clé>), pas en sous-domaine.
 */
/** US-CERT-01 — file d'émission des certificats (BullMQ, ADR-04). */
export interface CertificatsConfig {
  workerActif: boolean;
  tentatives: number;
  backoffMs: number;
}

export interface StockageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketLivrables: string;
}
export default (): {
  app: AppConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
  mail: MailConfig;
  oauthGoogle: OauthGoogleConfig;
  oauthGithub: OauthGithubConfig;
  minuterie: MinuterieConfig;
  stockage: StockageConfig;
  certificats: CertificatsConfig;
} => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    apiPrefix: process.env.API_PREFIX ?? 'api',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
  },
  jwt: {
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH as string,
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH as string,
    accessTokenExpiresIn: 900, // 15 minutes
    refreshTokenExpiresIn: 604800, // 7 jours
  },
  redis: {
    host: process.env.REDIS_HOST as string,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  mail: {
    host: process.env.SMTP_HOST as string,
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    from: process.env.MAIL_FROM ?? 'Cert_EET <no-reply@cert-eet.local>',
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3001',
  },
  oauthGoogle: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      'https://localhost/api/auth/oauth/google/callback',
  },
  oauthGithub: {
    clientId: process.env.GITHUB_CLIENT_ID as string,
    clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ??
      'https://localhost/api/auth/oauth/github/callback',
  },
  minuterie: {
    balayageActif: process.env.MINUTERIE_BALAYAGE_ACTIF !== 'false',
    intervalleSecondes: 60,
    delaiGraceSecondes: 30,
  },
  stockage: {
    endpoint: process.env.S3_ENDPOINT as string,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY as string,
    secretKey: process.env.S3_SECRET_KEY as string,
    bucketLivrables: process.env.S3_BUCKET_LIVRABLES ?? 'livrables',
  },
  certificats: {
    workerActif: (process.env.CERTIFICATS_WORKER ?? 'on') !== 'off',
    tentatives: parseInt(process.env.CERTIFICATS_TENTATIVES ?? '3', 10),
    backoffMs: parseInt(process.env.CERTIFICATS_BACKOFF_MS ?? '5000', 10),
  },
});

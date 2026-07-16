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

export default (): {
  app: AppConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
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
});
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

export default (): { app: AppConfig } => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    apiPrefix: process.env.API_PREFIX ?? 'api',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
  },
});

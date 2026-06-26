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

  // --- Branchés en INF03/INF04 (optionnels pour l'instant) ---
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .optional(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .optional(),
})
  // Refuse les clés inconnues seulement en avertissement : on n'échoue pas
  // sur des variables système, mais on valide strictement celles qu'on connaît.
  .unknown(true);

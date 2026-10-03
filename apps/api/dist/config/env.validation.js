"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
const Joi = require("joi");
exports.envValidationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'recette', 'production', 'test')
        .default('development'),
    PORT: Joi.number().port().default(3000),
    CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
    API_PREFIX: Joi.string().default('api'),
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().port().default(5432),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_NAME: Joi.string().required(),
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().port().default(6379),
    JWT_PRIVATE_KEY_PATH: Joi.string().required(),
    JWT_PUBLIC_KEY_PATH: Joi.string().required(),
    SMTP_HOST: Joi.string().required(),
    SMTP_PORT: Joi.number().port().default(1025),
    MAIL_FROM: Joi.string().default('Cert_EET <no-reply@cert-eet.local>'),
    APP_BASE_URL: Joi.string().uri().default('http://localhost:3001'),
    GOOGLE_CLIENT_ID: Joi.string().required(),
    GOOGLE_CLIENT_SECRET: Joi.string().required(),
    GOOGLE_CALLBACK_URL: Joi.string()
        .uri()
        .default('https://localhost/api/auth/oauth/google/callback'),
    GITHUB_CLIENT_ID: Joi.string().required(),
    GITHUB_CLIENT_SECRET: Joi.string().required(),
    GITHUB_CALLBACK_URL: Joi.string()
        .uri()
        .default('https://localhost/api/auth/oauth/github/callback'),
})
    .unknown(true);
//# sourceMappingURL=env.validation.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    app: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        port: parseInt(process.env.PORT ?? '3000', 10),
        corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
        apiPrefix: process.env.API_PREFIX ?? 'api',
        databaseUrl: process.env.DATABASE_URL,
        redisUrl: process.env.REDIS_URL,
    },
    jwt: {
        privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH,
        publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
        accessTokenExpiresIn: 900,
        refreshTokenExpiresIn: 604800,
    },
    redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    },
    mail: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
        from: process.env.MAIL_FROM ?? 'Cert_EET <no-reply@cert-eet.local>',
        appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3001',
    },
    oauthGoogle: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL ??
            'https://localhost/api/auth/oauth/google/callback',
    },
    oauthGithub: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackUrl: process.env.GITHUB_CALLBACK_URL ??
            'https://localhost/api/auth/oauth/github/callback',
    },
});
//# sourceMappingURL=configuration.js.map
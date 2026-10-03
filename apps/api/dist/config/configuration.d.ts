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
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
}
export interface RedisConfig {
    host: string;
    port: number;
}
export interface MailConfig {
    host: string;
    port: number;
    from: string;
    appBaseUrl: string;
}
export interface OauthGoogleConfig {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
}
export interface OauthGithubConfig {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
}
declare const _default: () => {
    app: AppConfig;
    jwt: JwtConfig;
    redis: RedisConfig;
    mail: MailConfig;
    oauthGoogle: OauthGoogleConfig;
    oauthGithub: OauthGithubConfig;
};
export default _default;

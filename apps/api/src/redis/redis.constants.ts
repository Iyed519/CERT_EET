/**
 * Jeton d'injection du client Redis brut (ioredis).
 *
 * Un client Redis n'est pas une classe à nous : NestJS ne peut pas le
 * résoudre par son type. On l'enregistre donc sous ce nom (string) et on
 * l'injecte via @Inject(REDIS_CLIENT). Centralisé ici pour éviter les
 * chaînes magiques dupliquées entre le module et le service.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
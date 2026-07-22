/**
 * Jeton d'injection du transporteur nodemailer.
 *
 * Un transporteur nodemailer n'est pas une classe à nous : NestJS ne peut pas
 * le résoudre par son type. On l'enregistre donc sous ce nom (string) et on
 * l'injecte via @Inject(MAIL_TRANSPORTER). Même logique que REDIS_CLIENT :
 * centralisé ici pour éviter les chaînes magiques dupliquées entre le module
 * et le service.
 */
export const MAIL_TRANSPORTER = 'MAIL_TRANSPORTER';

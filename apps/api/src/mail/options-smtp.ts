import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { MailConfig } from '../config/configuration';

/**
 * Options du transporteur SMTP (DEPLOY-smtp-auth), en fonction pure pour être
 * testée sans ouvrir de connexion.
 *
 * - Sans identifiants (dev, CI : Mailhog sur 1025) : connexion simple, aucune
 *   authentification — comportement d'avant, inchangé.
 * - Avec identifiants et `secure` faux (Gmail, port 587) : STARTTLS EXIGÉ
 *   (`requireTLS`) : le mot de passe ne part jamais en clair, et l'envoi
 *   échoue si le serveur ne propose pas TLS.
 * - `secure` vrai (port 465) : TLS dès la connexion.
 *
 * Délais bornés (US-FORM-03) : par défaut nodemailer attend jusqu'à 2 minutes
 * un serveur injoignable, et l'envoi se fait pendant la requête HTTP. 5 s pour
 * se connecter et recevoir l'accueil SMTP, 10 s d'inactivité au plus ensuite.
 */
export function construireOptionsSmtp(config: MailConfig): SMTPTransport.Options {
  const avecAuthentification = Boolean(config.user && config.password);
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(avecAuthentification
      ? {
          auth: { user: config.user as string, pass: config.password as string },
          requireTLS: !config.secure,
        }
      : {}),
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  };
}

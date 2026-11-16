import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MailConfig } from '../config/configuration';
import { MAIL_TRANSPORTER } from './mail.constants';
import { MailService } from './mail.service';
import { construireOptionsSmtp } from './options-smtp';

/**
 * Module d'envoi d'emails (US-CPT-05).
 *
 * Construit UN transporteur SMTP partagé au démarrage, à partir de la config
 * validée (SMTP_HOST / SMTP_PORT). En dev/CI il pointe sur Mailhog (aucune
 * authentification, port 1025) ; en déploiement, un vrai relais SMTP (Gmail…)
 * avec SMTP_USER / SMTP_PASSWORD (et SMTP_SECURE pour le port 465).
 *
 * @Global : comme RedisModule, c'est un singleton d'infrastructure utile dans
 * plusieurs modules métier (inscription maintenant, activation et reset plus
 * tard). On évite ainsi de le réimporter dans chaque module.
 */
@Global()
@Module({
  providers: [
    {
      // Provider « factory » : le transporteur vient de la lib nodemailer, pas
      // d'une classe à nous — on le fabrique depuis la config validée et on
      // l'expose sous le jeton MAIL_TRANSPORTER (même schéma que REDIS_CLIENT).
      provide: MAIL_TRANSPORTER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Transporter => {
        const config = configService.getOrThrow<MailConfig>('mail');
        const logger = new Logger('MailTransporter');

        // Options construites par une fonction pure (DEPLOY-smtp-auth) :
        // Mailhog sans authentification en dev/CI ; vrai relais (Gmail…)
        // avec authentification et TLS quand SMTP_USER / SMTP_PASSWORD sont
        // fournis. Délais bornés (US-FORM-03), voir construireOptionsSmtp.
        const options = construireOptionsSmtp(config);
        const transporter = nodemailer.createTransport(options);

        // Jamais le mot de passe dans les journaux : seulement le mode.
        const mode = options.auth
          ? options.secure
            ? 'authentifié, TLS'
            : 'authentifié, STARTTLS exigé'
          : 'sans authentification';
        logger.log(`Transporteur SMTP configuré (${config.host}:${config.port}, ${mode})`);
        return transporter;
      },
    },
    MailService,
  ],
  // On exporte MailService (usage courant). Le transporteur brut reste interne :
  // personne d'autre n'a besoin de nodemailer directement.
  exports: [MailService],
})
export class MailModule {}

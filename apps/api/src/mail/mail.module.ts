import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MailConfig } from '../config/configuration';
import { MAIL_TRANSPORTER } from './mail.constants';
import { MailService } from './mail.service';

/**
 * Module d'envoi d'emails (US-CPT-05).
 *
 * Construit UN transporteur SMTP partagé au démarrage, à partir de la config
 * validée (SMTP_HOST / SMTP_PORT). En dev/CI il pointe sur Mailhog (aucune
 * authentification, port 1025) ; en prod on branchera un vrai relais SMTP via
 * les mêmes variables d'environnement.
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
        const { host, port } = configService.getOrThrow<MailConfig>('mail');
        const logger = new Logger('MailTransporter');

        // secure: false + pas d'auth : Mailhog écoute en SMTP simple sur 1025.
        // Un vrai relais prod ajouterait auth + TLS via de nouvelles variables.
        // Délais bornés (US-FORM-03) : par défaut nodemailer attend jusqu'à
        // 2 minutes un serveur injoignable, et l'envoi se fait pendant la
        // requête HTTP. 5 s pour se connecter et recevoir l'accueil SMTP,
        // 10 s d'inactivité au plus ensuite : au-delà, l'envoi échoue vite et
        // l'appelant décide (bloquant à l'inscription, au mieux à l'affectation).
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: false,
          connectionTimeout: 5_000,
          greetingTimeout: 5_000,
          socketTimeout: 10_000,
        });

        logger.log(`Transporteur SMTP configuré (${host}:${port})`);
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

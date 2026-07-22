import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MailConfig } from '../config/configuration';
import { MAIL_TRANSPORTER } from './mail.constants';

/**
 * Façade mince au-dessus du transporteur nodemailer (US-CPT-05).
 *
 * Le reste du code (le service d'inscription maintenant, l'activation par
 * l'admin US-CPT-01 et la réinitialisation de mot de passe US-AUTH-06 plus
 * tard) n'écrit jamais un email « à la main » : il passe par ces méthodes
 * lisibles. Ça isole la dépendance à nodemailer en un seul endroit, et ça
 * garde le contenu des emails centralisé (on le réutilisera).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Envoie l'email de vérification d'adresse à un nouvel inscrit.
   *
   * Le lien pointe vers le FRONTEND (`APP_BASE_URL/verifier-email?token=…`),
   * pas directement vers l'API : l'utilisateur voit une vraie page, qui
   * appellera ensuite l'endpoint de vérification. Le token (UUID) est
   * l'identifiant à usage unique stocké dans Redis (TTL 48 h) par le service
   * d'inscription — ici on se contente de le placer dans l'URL.
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const { from, appBaseUrl } =
      this.configService.getOrThrow<MailConfig>('mail');
    const lienVerification = `${appBaseUrl}/verifier-email?token=${token}`;

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Cert_EET — Vérifiez votre adresse email',
      text:
        `Bienvenue sur Cert_EET !\n\n` +
        `Pour activer votre compte, cliquez sur le lien suivant ` +
        `(valable 48 heures) :\n${lienVerification}\n\n` +
        `Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.`,
      html:
        `<p>Bienvenue sur <strong>Cert_EET</strong> !</p>` +
        `<p>Pour activer votre compte, cliquez sur le lien suivant ` +
        `(valable 48 heures) :</p>` +
        `<p><a href="${lienVerification}">Vérifier mon adresse email</a></p>` +
        `<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.</p>`,
    });

    // On trace l'envoi (sans le contenu) : confirmation visible en dev et
    // trace légère. En dev tout part vers Mailhog, on peut logger l'adresse.
    this.logger.log(`Email de vérification envoyé à ${to}`);
  }
}

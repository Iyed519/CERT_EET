import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MailConfig } from '../config/configuration';
import { MAIL_TRANSPORTER } from './mail.constants';
/**
 * Façade mince au-dessus du transporteur nodemailer (US-CPT-05).
 * Centralise l'envoi ET le gabarit HTML des emails (réutilisable par les
 * stories futures : activation US-CPT-01, réinitialisation US-AUTH-06).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly configService: ConfigService,
  ) {}
  /**
   * Envoie l'email de vérification d'adresse à un nouvel inscrit (US-CPT-05).
   * Gabarit « table-based » + styles inline (contrainte des clients mail : ni
   * flexbox ni CSS externe) ; bouton « bulletproof » (cellule de table colorée)
   * pour un rendu fiable partout ; version texte fournie en repli.
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const { from, appBaseUrl } =
      this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/verifier-email?token=${token}`;
    const text =
      `Bienvenue sur Cert_EET !\n\n` +
      `Pour activer votre compte, confirmez votre adresse email en ouvrant le ` +
      `lien suivant (valable 48 heures) :\n${lien}\n\n` +
      `Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.\n\n` +
      `— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:#1e8449;padding:22px 30px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="36" height="36" align="center" valign="middle" style="background-color:rgba(255,255,255,0.20);border-radius:9px;color:#ffffff;font-size:14px;font-weight:bold;">CE</td>
                    <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.3px;">Cert_EET</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Confirmez votre adresse email</h1>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Bienvenue sur Cert_EET&nbsp;! Il ne reste qu'une étape : confirmez votre adresse pour activer votre compte et commencer à apprendre.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Vérifier mon adresse email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#8a97a3;">
                  Ce lien est valable <strong style="color:#1e8449;">48 heures</strong>.
                </p>
                <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#8a97a3;">
                  Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur&nbsp;:
                </p>
                <p style="margin:0 0 20px 0;font-size:13px;line-height:1.5;word-break:break-all;">
                  <a href="${lien}" target="_blank" style="color:#1e8449;text-decoration:underline;">${lien}</a>
                </p>
                <hr style="border:none;border-top:1px solid #ece7df;margin:8px 0 16px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.5;color:#8a97a3;">
                  Vous n'êtes pas à l'origine de cette inscription&nbsp;? Ignorez simplement cet email, aucun compte ne sera activé.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Certification numérique vérifiable.<br />
                  Email envoyé automatiquement, merci de ne pas y répondre.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    await this.transporter.sendMail({
      from,
      to,
      subject: 'Cert_EET — Confirmez votre adresse email',
      text,
      html,
    });
    this.logger.log(`Email de vérification envoyé à ${to}`);
  }
  /**
   * Prévient un formateur qu'il vient d'être affecté à une formation
   * (US-FORM-03, UC4 Administrateur). Même gabarit que l'email de
   * vérification. Le bouton mène à la plateforme : l'espace formateur d'une
   * formation n'existe pas encore, un lien direct ne mènerait nulle part.
   *
   * Le titre de la formation et le prénom sont des saisies libres : je les
   * ÉCHAPPE avant de les placer dans le HTML. Cette méthode laisse remonter
   * l'erreur d'envoi ; c'est l'appelant qui décide qu'elle n'est pas bloquante.
   */
  async sendAffectationFormateurEmail(
    to: string,
    donnees: { prenom: string | null; titreFormation: string },
  ): Promise<void> {
    const { from, appBaseUrl } =
      this.configService.getOrThrow<MailConfig>('mail');
    // Un objet d'email tient sur une ligne : je replie tout blanc éventuel.
    const titre = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const titreHtml = echapperHtml(titre);
    const salutationHtml = echapperHtml(salutation);
    const text =
      `${salutation}\n\n` +
      `Un administrateur vous a affecté à la formation « ${titre} » sur ` +
      `Cert_EET. Vous pouvez désormais y créer et gérer des évaluations.\n\n` +
      `Accéder à la plateforme : ${appBaseUrl}\n\n` +
      `Si cette affectation vous semble être une erreur, contactez un ` +
      `administrateur.\n\n` +
      `— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:#1e8449;padding:22px 30px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="36" height="36" align="center" valign="middle" style="background-color:rgba(255,255,255,0.20);border-radius:9px;color:#ffffff;font-size:14px;font-weight:bold;">CE</td>
                    <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.3px;">Cert_EET</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Vous êtes affecté à une formation</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${salutationHtml}</p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Un administrateur vous a affecté à la formation
                  <strong style="color:#1b2631;">«&nbsp;${titreHtml}&nbsp;»</strong>.
                  Vous pouvez désormais y créer et gérer des évaluations.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${appBaseUrl}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Accéder à la plateforme</a>
                    </td>
                  </tr>
                </table>
                <hr style="border:none;border-top:1px solid #ece7df;margin:8px 0 16px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.5;color:#8a97a3;">
                  Cette affectation vous semble être une erreur&nbsp;? Contactez un administrateur de la plateforme.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Certification numérique vérifiable.<br />
                  Email envoyé automatiquement, merci de ne pas y répondre.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    await this.transporter.sendMail({
      from,
      to,
      subject: `Cert_EET — Vous êtes affecté à la formation « ${titre} »`,
      text,
      html,
    });
    this.logger.log(`Email d'affectation envoyé à ${to}`);
  }
  /**
   * Souhaite la bienvenue à un apprenant qui vient de s'inscrire à une
   * formation (US-INSC-01, UC4 Administrateur). Même gabarit que les autres
   * emails ; le bouton mène à « Mes inscriptions ».
   *
   * Titre et prénom sont des saisies libres : ÉCHAPPÉS dans le HTML, et le
   * titre est replié sur une ligne dans l'objet. Les dates (AAAA-MM-JJ) sont
   * affichées au format JJ/MM/AAAA, et omises si la formation n'en a pas.
   * L'erreur d'envoi remonte : c'est l'appelant qui la rend non bloquante.
   */
  async sendBienvenueInscriptionEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreFormation: string;
      dateDebut: string | null;
      dateFin: string | null;
    },
  ): Promise<void> {
    const { from, appBaseUrl } =
      this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/mes-inscriptions`;
    const titre = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const periode = periodeFormation(donnees.dateDebut, donnees.dateFin);
    const titreHtml = echapperHtml(titre);
    const salutationHtml = echapperHtml(salutation);
    const text =
      `${salutation}\n\n` +
      `Votre inscription à la formation « ${titre} » est confirmée. ` +
      `Vous y avez accès dès maintenant.\n` +
      (periode ? `Période : ${periode}.\n` : '') +
      `\nRetrouvez vos formations : ${lien}\n\n` +
      `Si vous n'êtes pas à l'origine de cette inscription, contactez un ` +
      `administrateur.\n\n` +
      `— L'équipe Cert_EET`;
    const periodeHtml = periode
      ? `
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#4a5866;">
                  Période&nbsp;: <strong style="color:#1b2631;">${periode}</strong>
                </p>`
      : '';
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:#1e8449;padding:22px 30px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="36" height="36" align="center" valign="middle" style="background-color:rgba(255,255,255,0.20);border-radius:9px;color:#ffffff;font-size:14px;font-weight:bold;">CE</td>
                    <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.3px;">Cert_EET</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Bienvenue dans votre formation</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${salutationHtml}</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Votre inscription à la formation
                  <strong style="color:#1b2631;">«&nbsp;${titreHtml}&nbsp;»</strong>
                  est confirmée. Vous y avez accès dès maintenant.
                </p>${periodeHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir mes inscriptions</a>
                    </td>
                  </tr>
                </table>
                <hr style="border:none;border-top:1px solid #ece7df;margin:8px 0 16px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.5;color:#8a97a3;">
                  Vous n'êtes pas à l'origine de cette inscription&nbsp;? Contactez un administrateur de la plateforme.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Certification numérique vérifiable.<br />
                  Email envoyé automatiquement, merci de ne pas y répondre.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    await this.transporter.sendMail({
      from,
      to,
      subject: `Cert_EET — Inscription confirmée : « ${titre} »`,
      text,
      html,
    });
    this.logger.log(`Email de bienvenue (inscription) envoyé à ${to}`);
  }
}
/**
 * Période d'une formation pour un email : « du JJ/MM/AAAA au JJ/MM/AAAA »,
 * ou une seule borne si l'autre manque, ou null si aucune date n'est fixée.
 */
function periodeFormation(dateDebut: string | null, dateFin: string | null): string | null {
  const debut = dateDebut ? dateFrancaise(dateDebut) : null;
  const fin = dateFin ? dateFrancaise(dateFin) : null;
  if (debut && fin) return `du ${debut} au ${fin}`;
  if (debut) return `à partir du ${debut}`;
  if (fin) return `jusqu'au ${fin}`;
  return null;
}
/** AAAA-MM-JJ -> JJ/MM/AAAA (sans passer par Date : pas de décalage horaire). */
function dateFrancaise(date: string): string {
  const [annee, mois, jour] = date.split('-');
  return `${jour}/${mois}/${annee}`;
}
/**
 * Neutralise les caractères actifs du HTML dans une saisie libre, avant de
 * l'insérer dans le corps d'un email.
 */
function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

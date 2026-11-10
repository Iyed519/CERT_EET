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
  /**
   * Prévient un formateur affecté qu'un apprenant a déposé un livrable
   * (US-ATEL-04, DS-03 : notifier(formateur, « Nouveau livrable soumis »)).
   * Même gabarit que les autres emails ; le bouton mène à la fiche de
   * l'atelier. Noms et titres sont des saisies libres : ÉCHAPPÉS dans le HTML,
   * repliés sur une ligne dans l'objet. L'erreur d'envoi remonte : c'est
   * l'appelant qui la rend non bloquante.
   */
  async sendLivrableSoumisEmail(
    to: string,
    donnees: {
      prenom: string | null;
      nomApprenant: string;
      titreAtelier: string;
      titreFormation: string;
      atelierId: string;
      enRetard: boolean;
    },
  ): Promise<void> {
    const { from, appBaseUrl } =
      this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/formateur/ateliers/${donnees.atelierId}`;
    const atelier = donnees.titreAtelier.replace(/\s+/g, ' ').trim();
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const apprenant = donnees.nomApprenant.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const retard = donnees.enRetard
      ? ' Il a été déposé après la date limite, pendant la tolérance de retard.'
      : '';
    const text =
      `${salutation}\n\n` +
      `${apprenant} a déposé un livrable pour l'atelier « ${atelier} » ` +
      `(formation « ${formation} »).${retard}\n\n` +
      `Voir l'atelier : ${lien}\n\n` +
      `— L'équipe Cert_EET`;
    const retardHtml = donnees.enRetard
      ? `
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#b9770e;">
                  Déposé après la date limite, pendant la tolérance de retard.
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
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Nouveau livrable soumis</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  <strong style="color:#1b2631;">${echapperHtml(apprenant)}</strong> a déposé un livrable pour l’atelier
                  <strong style="color:#1b2631;">«&nbsp;${echapperHtml(atelier)}&nbsp;»</strong>
                  (formation «&nbsp;${echapperHtml(formation)}&nbsp;»).
                </p>${retardHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir l’atelier</a>
                    </td>
                  </tr>
                </table>
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
      subject: `Cert_EET — Nouveau livrable : « ${atelier} »`,
      text,
      html,
    });
    this.logger.log(`Email de livrable soumis envoyé à ${to}`);
  }

  /**
   * US-ATEL-07 — Email « votre livrable a été corrigé » à l'apprenant, une
   * fois la correction finalisée (DS-03 : notifier(apprenant, { score,
   * lienFeedback })). Le lien mène à la fiche de l'atelier, où le feedback
   * détaillé est consultable (US-ATEL-08). Le score figure dans le message ;
   * le détail par critère et le commentaire général restent sur la plateforme.
   */
  async sendCorrectionFinaliseeEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreAtelier: string;
      titreFormation: string;
      atelierId: string;
      score: number;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/mes-ateliers/${donnees.atelierId}`;
    const atelier = donnees.titreAtelier.replace(/\s+/g, ' ').trim();
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const score = `${donnees.score.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} / 100`;
    const text =
      `${salutation}\n\n` +
      `Votre livrable pour l'atelier « ${atelier} » (formation « ${formation} ») ` +
      `a été corrigé. Note obtenue : ${score}.\n\n` +
      `Consulter le feedback détaillé : ${lien}\n\n` +
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
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Votre livrable a été corrigé</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Votre livrable pour l’atelier
                  <strong style="color:#1b2631;">«&nbsp;${echapperHtml(atelier)}&nbsp;»</strong>
                  (formation «&nbsp;${echapperHtml(formation)}&nbsp;») a été corrigé.
                </p>
                <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Note obtenue : <strong style="color:#1e8449;font-size:18px;">${echapperHtml(score)}</strong>
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir le feedback</a>
                    </td>
                  </tr>
                </table>
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
      subject: `Cert_EET — Livrable corrigé : « ${atelier} »`,
      text,
      html,
    });
    this.logger.log(`Email de correction finalisée envoyé à ${to}`);
  }

  /**
   * US-CERT-01 — Email « votre certificat est disponible » (DS-04 :
   * notifier(apprenant, { lienTelechargement, urlVerification })). Le lien de
   * vérification publique ne contient que l'identifiant du certificat.
   */
  async sendCertificatEmisEmail(
    to: string,
    donnees: { prenom: string | null; titreFormation: string; urlVerification: string },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const lienEspace = `${appBaseUrl}/mes-certificats`;
    const text =
      `${salutation}\n\n` +
      `Félicitations : votre certificat pour la formation « ${formation} » est disponible.\n\n` +
      `Le télécharger : ${lienEspace}\n` +
      `Lien de vérification publique (à partager) : ${donnees.urlVerification}\n\n` +
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
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Votre certificat est disponible</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Félicitations : votre certificat pour la formation
                  <strong style="color:#1b2631;">«&nbsp;${echapperHtml(formation)}&nbsp;»</strong> est disponible.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lienEspace}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir mon certificat</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#4a5866;">
                  Lien de vérification publique, à partager :<br />
                  <a href="${echapperHtml(donnees.urlVerification)}" style="color:#1e8449;word-break:break-all;">${echapperHtml(donnees.urlVerification)}</a>
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
      subject: `Cert_EET — Votre certificat : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Email de certificat émis envoyé à ${to}`);
  }

  /**
   * US-CERT-06 — Révocation d'un certificat (DS-07) : le titulaire apprend la
   * formation concernée, le motif (catégorie, jamais la description interne),
   * la date, et qui contacter. Aucun lien de vérification : il afficherait
   * désormais « Révoqué ».
   */
  async sendCertificatRevoqueEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreFormation: string;
      motif: string;
      dateRevocation: Date;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const date = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeZone: 'Africa/Tunis',
    }).format(donnees.dateRevocation);
    const lienEspace = `${appBaseUrl}/mes-certificats`;
    const text =
      `${salutation}\n\n` +
      `Votre certificat pour la formation « ${formation} » a été révoqué le ${date}.\n` +
      `Motif : ${donnees.motif}.\n\n` +
      `Il n'est plus téléchargeable et sa vérification publique indique désormais « Révoqué ».\n` +
      `Pour toute question ou contestation, contactez l'administration d'ESPRIT Entreprise.\n\n` +
      `Votre espace : ${lienEspace}\n\n` +
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
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Votre certificat a été révoqué</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Votre certificat pour la formation
                  <strong style="color:#1b2631;">«&nbsp;${echapperHtml(formation)}&nbsp;»</strong>
                  a été révoqué le ${echapperHtml(date)}.
                </p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Motif : <strong style="color:#1b2631;">${echapperHtml(donnees.motif)}</strong>.
                </p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Il n’est plus téléchargeable et sa vérification publique indique désormais
                  «&nbsp;Révoqué&nbsp;». Pour toute question ou contestation, contactez
                  l’administration d’ESPRIT Entreprise.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lienEspace}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Mon espace</a>
                    </td>
                  </tr>
                </table>
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
      subject: `Cert_EET — Révocation de votre certificat : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Email de révocation de certificat envoyé à ${to}`);
  }

  /**
   * US-CERT-02 — Alerte à l'administrateur : la génération d'un certificat a
   * échoué définitivement (tentatives épuisées). Le certificat reste en
   * attente ; le lien mène à la supervision, filtrée sur les échecs, où il
   * peut être relancé.
   */
  async sendCertificatEchecEmail(
    to: string,
    donnees: {
      prenom: string | null;
      certificatId: string;
      nomApprenant: string;
      titreFormation: string;
      nbTentatives: number;
      erreur: string;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const apprenant = donnees.nomApprenant.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const lien = `${appBaseUrl}/admin/certificats?enEchec=true`;
    const text =
      `${salutation}\n\n` +
      `La génération du certificat de ${apprenant} pour la formation « ${formation} » a échoué ` +
      `après ${donnees.nbTentatives} tentative(s).\n` +
      `Dernière erreur : ${donnees.erreur}\n\n` +
      `Le certificat reste en attente : aucun document partiel n'a été publié. ` +
      `Vous pouvez le relancer depuis la supervision des certificats.\n\n` +
      `Supervision : ${lien}\n\n` +
      `— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:#1e8449;padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Échec de génération d’un certificat</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  La génération du certificat de <strong style="color:#1b2631;">${echapperHtml(apprenant)}</strong>
                  pour la formation <strong style="color:#1b2631;">«&nbsp;${echapperHtml(formation)}&nbsp;»</strong>
                  a échoué après ${donnees.nbTentatives} tentative(s).
                </p>
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#922b21;">Dernière erreur : ${echapperHtml(donnees.erreur)}</p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4a5866;">
                  Le certificat reste en attente : aucun document partiel n’a été publié.
                  Vous pouvez le relancer depuis la supervision des certificats.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir la supervision</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">Email envoyé automatiquement, merci de ne pas y répondre.</p>
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
      subject: `Cert_EET — Échec de génération d’un certificat : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Alerte d'échec de certificat envoyée à ${to}`);
  }

  /**
   * US-IA-01 — Email au formateur à la fin de l'indexation d'un support
   * (DS-06 : notifier(formateurId, « Support indexé et prêt à l'utilisation »)).
   * En cas d'échec, le motif (en français, sans détail technique) est donné ;
   * le formateur peut relancer l'indexation depuis la page de sa formation.
   */
  async sendSupportIndexationEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreSupport: string;
      titreFormation: string;
      formationId: string;
      reussi: boolean;
      nbSegments?: number;
      motif?: string;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/formateur/formations/${donnees.formationId}`;
    const support = donnees.titreSupport.replace(/\s+/g, ' ').trim();
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const titre = donnees.reussi ? 'Support indexé' : 'Indexation impossible';
    const phrase = donnees.reussi
      ? `Le support « ${support} » (formation « ${formation} ») est indexé ` +
        `(${donnees.nbSegments ?? 0} passages) : il peut servir à générer des questions.`
      : `Le support « ${support} » (formation « ${formation} ») n'a pas pu être indexé. ` +
        `Motif : ${(donnees.motif ?? 'erreur inconnue').replace(/\s+/g, ' ').trim()}`;
    const couleur = donnees.reussi ? '#1e8449' : '#b03a2e';
    const text = `${salutation}\n\n${phrase}\n\nOuvrir la formation : ${lien}\n\n— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:${couleur};padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">${echapperHtml(titre)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(phrase)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="${couleur}" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Ouvrir la formation</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
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
      subject: `Cert_EET — ${titre} : « ${support} »`,
      text,
      html,
    });
    this.logger.log(`Email d'indexation de support envoyé à ${to}`);
  }

  /**
   * US-IA-03 — Email au formateur à la fin d'une génération de questions
   * (DS-06 : notifier(formateurId, « N suggestions prêtes à réviser »)).
   */
  async sendGenerationTermineeEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreSupport: string;
      formationId: string;
      reussie: boolean;
      nbSuggestions?: number;
      motif?: string;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/formateur/formations/${donnees.formationId}`;
    const support = donnees.titreSupport.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const n = donnees.nbSuggestions ?? 0;
    const titre = donnees.reussie ? 'Questions prêtes à réviser' : 'Génération impossible';
    const phrase = donnees.reussie
      ? `${n} suggestion${n > 1 ? 's' : ''} de question${n > 1 ? 's' : ''} ` +
        `à partir du support « ${support} » ${n > 1 ? 'sont prêtes' : 'est prête'} : ` +
        `aucune n'est publiée sans votre validation.`
      : `La génération de questions à partir du support « ${support} » n'a pas abouti. ` +
        `Motif : ${(donnees.motif ?? 'erreur inconnue').replace(/\s+/g, ' ').trim()}`;
    const couleur = donnees.reussie ? '#1e8449' : '#b03a2e';
    const text = `${salutation}\n\n${phrase}\n\nOuvrir la formation : ${lien}\n\n— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:${couleur};padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">${echapperHtml(titre)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(phrase)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="${couleur}" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Ouvrir la formation</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
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
      subject: `Cert_EET — ${titre} : « ${support} »`,
      text,
      html,
    });
    this.logger.log(`Email de fin de génération envoyé à ${to}`);
  }

  /**
   * US-SUIVI-02 — Récapitulatif des nouvelles alertes de décrochage d'un
   * balayage, au formateur affecté (DS-14 P2 : « notifier(formateurId) »).
   * Faits seulement (apprenant, formation, critère) : le détail est dans
   * l'application.
   */
  async sendAlertesDecrochageEmail(
    to: string,
    donnees: {
      prenom: string | null;
      alertes: Array<{ apprenant: string; formation: string; critere: string }>;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/formateur/alertes`;
    const LIBELLES: Record<string, string> = {
      INACTIVITE: 'aucune connexion depuis plus de 7 jours',
      ECHECS_QCM: 'deux échecs consécutifs au QCM',
      LIVRABLE_EN_RETARD: 'livrable non rendu 48 h après la date limite',
      SCORE_EN_CHUTE: 'note en forte baisse',
    };
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const n = donnees.alertes.length;
    const titre = `${n} nouvelle${n > 1 ? 's' : ''} alerte${n > 1 ? 's' : ''} de décrochage`;
    const lignes = donnees.alertes.map(
      (a) =>
        `${a.apprenant.replace(/\s+/g, ' ').trim()} — ${a.formation.replace(/\s+/g, ' ').trim()} : ` +
        (LIBELLES[a.critere] ?? a.critere),
    );
    const text =
      `${salutation}\n\n${titre} :\n${lignes.map((l) => `- ${l}`).join('\n')}\n\n` +
      `Voir les alertes : ${lien}\n\n— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,0.08);">
            <tr>
              <td style="background-color:#b9770e;padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">${echapperHtml(titre)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <ul style="margin:0 0 22px 0;padding-left:20px;font-size:15px;line-height:1.6;color:#4a5866;">
                  ${lignes.map((l) => `<li>${echapperHtml(l)}</li>`).join('\n                  ')}
                </ul>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#b9770e" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Voir les alertes</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    await this.transporter.sendMail({ from, to, subject: `Cert_EET — ${titre}`, text, html });
    this.logger.log(`Email d'alertes de décrochage envoyé à ${to}`);
  }

  /**
   * US-RPT-01 — Email au demandeur à la fin de la génération d'un rapport
   * (DS-14 P3 : « notifier(formateur, rapport prêt) »). Le fichier n'est
   * jamais joint : il se télécharge, authentifié, depuis « Mes rapports ».
   */
  async sendRapportPretEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreFormation: string;
      nomFichier: string | null;
      reussi: boolean;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/rapports`;
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const titre = donnees.reussi ? 'Rapport prêt' : 'Rapport non généré';
    const phrase = donnees.reussi
      ? `Votre rapport « ${formation} » (${donnees.nomFichier ?? ''}) est prêt : ` +
        `téléchargez-le depuis « Mes rapports ».`
      : `La génération de votre rapport « ${formation} » n'a pas abouti après plusieurs essais. ` +
        `Vous pouvez le demander à nouveau.`;
    const couleur = donnees.reussi ? '#1e8449' : '#b03a2e';
    const text = `${salutation}\n\n${phrase}\n\nMes rapports : ${lien}\n\n— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:${couleur};padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">${echapperHtml(titre)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(phrase)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="${couleur}" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Mes rapports</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
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
      subject: `Cert_EET — ${titre} : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Email de rapport envoyé à ${to}`);
  }

  /**
   * US-INSC-02 — Email à l'apprenant quand un administrateur suspend ou
   * réactive son inscription (motif repris s'il y en a un). Erreur remontée :
   * l'appelant la rend non bloquante.
   */
  async sendStatutInscriptionEmail(
    to: string,
    donnees: {
      prenom: string | null;
      titreFormation: string;
      suspendue: boolean;
      motif: string | null;
    },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/mes-inscriptions`;
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenom?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const titre = donnees.suspendue ? 'Inscription suspendue' : 'Inscription réactivée';
    const phrase = donnees.suspendue
      ? `Votre inscription à la formation « ${formation} » a été suspendue par un administrateur.`
      : `Votre inscription à la formation « ${formation} » a été réactivée : vous pouvez reprendre votre parcours.`;
    const motif = donnees.suspendue && donnees.motif ? `Motif : ${donnees.motif}` : '';
    const couleur = donnees.suspendue ? '#b03a2e' : '#1e8449';
    const text = [salutation, '', phrase, motif, '', `Mes inscriptions : ${lien}`, '', "— L'équipe Cert_EET"]
      .filter((l, i, t) => !(l === '' && t[i - 1] === ''))
      .join('\n');
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:${couleur};padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">${echapperHtml(titre)}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(phrase)}</p>
                ${motif ? `<p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(motif)}</p>` : ''}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="${couleur}" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Mes inscriptions</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
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
      subject: `Cert_EET — ${titre} : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Email de statut d’inscription envoyé à ${to}`);
  }

  /**
   * US-INSC-03 — Email au formateur affecté quand un apprenant se désinscrit
   * (DS-11 P1 : « notifier les formateurs »). Erreur remontée : l'appelant la
   * rend non bloquante.
   */
  async sendDesinscriptionFormateurEmail(
    to: string,
    donnees: { prenomFormateur: string | null; nomApprenant: string; titreFormation: string },
  ): Promise<void> {
    const { from, appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/formateur/formations`;
    const formation = donnees.titreFormation.replace(/\s+/g, ' ').trim();
    const apprenant = donnees.nomApprenant.replace(/\s+/g, ' ').trim();
    const prenom = donnees.prenomFormateur?.trim() ?? '';
    const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
    const phrase = `${apprenant} s’est désinscrit(e) de la formation « ${formation} ». Son inscription est suspendue ; ses résultats restent consultables dans le suivi.`;
    const text = `${salutation}\n\n${phrase}\n\nMes formations : ${lien}\n\n— L'équipe Cert_EET`;
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f2f4f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f3;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#1e8449;padding:22px 30px;color:#ffffff;font-size:18px;font-weight:bold;">Cert_EET</td>
            </tr>
            <tr>
              <td style="padding:34px 34px 6px 34px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1b2631;">Désinscription d’un apprenant</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(salutation)}</p>
                <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a5866;">${echapperHtml(phrase)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">
                  <tr>
                    <td align="center" bgcolor="#1e8449" style="border-radius:10px;">
                      <a href="${lien}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Mes formations</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 26px 34px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#aab4bd;">
                  © Cert_EET — Email envoyé automatiquement, merci de ne pas y répondre.
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
      subject: `Cert_EET — Désinscription : « ${formation} »`,
      text,
      html,
    });
    this.logger.log(`Email de désinscription envoyé à ${to}`);
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

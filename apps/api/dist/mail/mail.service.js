"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mail_constants_1 = require("./mail.constants");
let MailService = MailService_1 = class MailService {
    constructor(transporter, configService) {
        this.transporter = transporter;
        this.configService = configService;
        this.logger = new common_1.Logger(MailService_1.name);
    }
    async sendVerificationEmail(to, token) {
        const { from, appBaseUrl } = this.configService.getOrThrow('mail');
        const lien = `${appBaseUrl}/verifier-email?token=${token}`;
        const text = `Bienvenue sur Cert_EET !\n\n` +
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
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(mail_constants_1.MAIL_TRANSPORTER)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map
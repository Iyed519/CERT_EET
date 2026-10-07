import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MAIL_TRANSPORTER } from './mail.constants';
import { MailService } from './mail.service';

/**
 * Tests unitaires de MailService — email d'affectation d'un formateur
 * (US-FORM-03).
 *
 * Le transporteur est un faux : je vérifie le message remis à nodemailer
 * (destinataire, objet, contenu) et surtout que les saisies libres sont
 * échappées avant d'entrer dans le HTML.
 */
describe('MailService', () => {
  let service: MailService;

  const mockTransporter = { sendMail: jest.fn() };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue({
      host: 'mailhog',
      port: 1025,
      from: 'Cert_EET <no-reply@cert-eet.local>',
      appBaseUrl: 'http://localhost:3001',
    }),
  };

  const dernierMessage = (): { to: string; subject: string; text: string; html: string } =>
    mockTransporter.sendMail.mock.calls[0][0];

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTransporter.sendMail.mockResolvedValue(undefined);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MAIL_TRANSPORTER, useValue: mockTransporter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = moduleRef.get<MailService>(MailService);
  });

  describe('sendAffectationFormateurEmail', () => {
    it('envoie au formateur un message qui nomme la formation et mène à la plateforme', async () => {
      await service.sendAffectationFormateurEmail('formateur@cert-eet.local', {
        prenom: 'Amine',
        titreFormation: 'DevOps avancé',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const message = dernierMessage();
      expect(message.to).toBe('formateur@cert-eet.local');
      expect(message.subject).toBe('Cert_EET — Vous êtes affecté à la formation « DevOps avancé »');
      expect(message.text).toContain('Bonjour Amine,');
      expect(message.text).toContain('« DevOps avancé »');
      expect(message.text).toContain('http://localhost:3001');
      expect(message.html).toContain('Bonjour Amine,');
      expect(message.html).toContain('DevOps avancé');
      expect(message.html).toContain('href="http://localhost:3001"');
    });

    it('salue sans prénom quand le compte n’en a pas', async () => {
      await service.sendAffectationFormateurEmail('formateur@cert-eet.local', {
        prenom: null,
        titreFormation: 'DevOps',
      });

      expect(dernierMessage().text.startsWith('Bonjour,\n')).toBe(true);
      expect(dernierMessage().html).toContain('>Bonjour,<');
    });

    it('échappe le titre et le prénom dans le HTML', async () => {
      await service.sendAffectationFormateurEmail('formateur@cert-eet.local', {
        prenom: '<b>Amine</b>',
        titreFormation: 'C++ & <script>alert("x")</script>',
      });

      const { html } = dernierMessage();
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Amine</b>');
      expect(html).toContain('C++ &amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;b&gt;Amine&lt;/b&gt;');
    });

    it('garde l’objet sur une seule ligne', async () => {
      await service.sendAffectationFormateurEmail('formateur@cert-eet.local', {
        prenom: 'Amine',
        titreFormation: 'DevOps\r\nBcc: intrus@exemple.tn',
      });

      expect(dernierMessage().subject).not.toMatch(/[\r\n]/);
    });

    it('laisse remonter l’erreur d’envoi à l’appelant', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        service.sendAffectationFormateurEmail('formateur@cert-eet.local', {
          prenom: 'Amine',
          titreFormation: 'DevOps',
        }),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});

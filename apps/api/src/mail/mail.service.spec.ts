import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MAIL_TRANSPORTER } from './mail.constants';
import { MailService } from './mail.service';

/**
 * Tests unitaires de MailService — email d'affectation d'un formateur
 * (US-FORM-03) et email de bienvenue à l'inscription (US-INSC-01).
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
  describe('sendBienvenueInscriptionEmail', () => {
    const donnees = {
      prenom: 'Sarra',
      titreFormation: 'DevOps avancé',
      dateDebut: '2026-11-02',
      dateFin: '2026-12-18',
    };

    it('confirme l’inscription, donne la période et mène à « Mes inscriptions »', async () => {
      await service.sendBienvenueInscriptionEmail('apprenant@cert-eet.local', donnees);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const message = dernierMessage();
      expect(message.to).toBe('apprenant@cert-eet.local');
      expect(message.subject).toBe('Cert_EET — Inscription confirmée : « DevOps avancé »');
      expect(message.text).toContain('Bonjour Sarra,');
      expect(message.text).toContain('Période : du 02/11/2026 au 18/12/2026.');
      expect(message.text).toContain('http://localhost:3001/mes-inscriptions');
      expect(message.html).toContain('du 02/11/2026 au 18/12/2026');
      expect(message.html).toContain('href="http://localhost:3001/mes-inscriptions"');
    });

    it('omet la période quand la formation n’a pas de dates', async () => {
      await service.sendBienvenueInscriptionEmail('apprenant@cert-eet.local', {
        ...donnees,
        dateDebut: null,
        dateFin: null,
      });

      expect(dernierMessage().text).not.toContain('Période');
      expect(dernierMessage().html).not.toContain('Période');
    });

    it('n’affiche que la borne connue', async () => {
      await service.sendBienvenueInscriptionEmail('apprenant@cert-eet.local', {
        ...donnees,
        dateFin: null,
      });

      expect(dernierMessage().text).toContain('Période : à partir du 02/11/2026.');
    });

    it('échappe le titre et le prénom dans le HTML, objet sur une ligne', async () => {
      await service.sendBienvenueInscriptionEmail('apprenant@cert-eet.local', {
        ...donnees,
        prenom: '<i>Sarra</i>',
        titreFormation: 'C++ & <script>x</script>\r\nBcc: intrus@exemple.tn',
      });

      const { html, subject } = dernierMessage();
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<i>Sarra</i>');
      expect(html).toContain('C++ &amp; &lt;script&gt;x&lt;/script&gt;');
      expect(subject).not.toMatch(/[\r\n]/);
    });
  });
});

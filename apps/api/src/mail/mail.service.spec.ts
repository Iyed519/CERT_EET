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
    it('envoie au formateur un message qui nomme la formation et mène à sa page d’accueil', async () => {
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
      expect(message.text).toContain('http://localhost:3001/formateur/formations');
      expect(message.html).toContain('Bonjour Amine,');
      expect(message.html).toContain('DevOps avancé');
      expect(message.html).toContain('href="http://localhost:3001/formateur/formations"');
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

  describe('sendCorrectionFinaliseeEmail (US-ATEL-07)', () => {
    const donnees = {
      prenom: 'Sami',
      titreAtelier: 'Projet API',
      titreFormation: 'Back-end',
      atelierId: 'at-1',
      score: 71.5,
    };

    it('donne la note à la française et mène à la fiche de l’atelier', async () => {
      await service.sendCorrectionFinaliseeEmail('sami@cert-eet.local', donnees);
      const message = dernierMessage();
      expect(message.to).toBe('sami@cert-eet.local');
      expect(message.subject).toBe('Cert_EET — Livrable corrigé : « Projet API »');
      expect(message.text).toContain('Bonjour Sami,');
      expect(message.text).toContain('Note obtenue : 71,5 / 100.');
      expect(message.text).toContain('http://localhost:3001/mes-ateliers/at-1');
      expect(message.html).toContain('href="http://localhost:3001/mes-ateliers/at-1"');
      expect(message.html).toContain('71,5 / 100');
    });

    it('échappe les titres, salue sans prénom, objet sur une ligne', async () => {
      await service.sendCorrectionFinaliseeEmail('sami@cert-eet.local', {
        ...donnees,
        prenom: null,
        titreAtelier: 'API <script>x</script>\r\nBcc: intrus@exemple.tn',
      });
      const message = dernierMessage();
      expect(message.html).not.toContain('<script>');
      expect(message.html).toContain('&lt;script&gt;');
      expect(message.text.startsWith('Bonjour,\n')).toBe(true);
      expect(message.subject).not.toMatch(/[\r\n]/);
    });

    it('laisse remonter l’erreur d’envoi', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.sendCorrectionFinaliseeEmail('sami@cert-eet.local', donnees),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('sendCertificatEmisEmail (US-CERT-01)', () => {
    const donnees = {
      prenom: 'Inès',
      titreFormation: 'Back-end',
      urlVerification: 'http://localhost:3001/verifier/c-1',
    };

    it('mène à « Mes certificats » et donne le lien de vérification', async () => {
      await service.sendCertificatEmisEmail('ines@cert-eet.local', donnees);
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Votre certificat : « Back-end »');
      expect(message.text).toContain('Bonjour Inès,');
      expect(message.text).toContain('http://localhost:3001/mes-certificats');
      expect(message.text).toContain('http://localhost:3001/verifier/c-1');
      expect(message.html).toContain('href="http://localhost:3001/verifier/c-1"');
    });

    it('échappe le titre ; objet sur une ligne', async () => {
      await service.sendCertificatEmisEmail('ines@cert-eet.local', {
        ...donnees,
        prenom: null,
        titreFormation: '<b>X</b>\r\nBcc: intrus@exemple.tn',
      });
      const message = dernierMessage();
      expect(message.html).not.toContain('<b>X</b>');
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.text.startsWith('Bonjour,\n')).toBe(true);
    });
  });

  describe('sendSupportIndexationEmail (US-IA-01)', () => {
    const donnees = {
      prenom: 'Sami',
      titreSupport: 'Cours JWT',
      titreFormation: 'Back-end',
      formationId: 'f-1',
      reussi: true,
      nbSegments: 12,
    };

    it('annonce le support indexé et mène à la formation', async () => {
      await service.sendSupportIndexationEmail('sami@cert-eet.local', donnees);
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Support indexé : « Cours JWT »');
      expect(message.text).toContain('Bonjour Sami,');
      expect(message.text).toContain('(12 passages)');
      expect(message.text).toContain('http://localhost:3001/formateur/formations/f-1');
      expect(message.html).toContain('href="http://localhost:3001/formateur/formations/f-1"');
    });

    it('donne le motif d’un échec, échappe le HTML, objet sur une ligne', async () => {
      await service.sendSupportIndexationEmail('sami@cert-eet.local', {
        ...donnees,
        prenom: null,
        reussi: false,
        titreSupport: '<b>X</b>\r\nBcc: intrus@exemple.tn',
        motif: 'PDF illisible <ou> endommagé.',
      });
      const message = dernierMessage();
      expect(message.subject).toMatch(/^Cert_EET — Indexation impossible : /);
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.text).toContain('Motif : PDF illisible <ou> endommagé.');
      expect(message.html).not.toContain('<b>X</b>');
      expect(message.html).toContain('&lt;ou&gt;');
      expect(message.text.startsWith('Bonjour,\n')).toBe(true);
    });
  });

  describe('sendGenerationTermineeEmail (US-IA-03)', () => {
    const donnees = {
      prenom: 'Sami',
      titreSupport: 'Cours JWT',
      formationId: 'f-1',
      reussie: true,
      nbSuggestions: 8,
    };

    it('annonce les suggestions à réviser et mène à la formation', async () => {
      await service.sendGenerationTermineeEmail('sami@cert-eet.local', donnees);
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Questions prêtes à réviser : « Cours JWT »');
      expect(message.text).toContain('8 suggestions de questions');
      expect(message.text).toContain("aucune n'est publiée sans votre validation");
      expect(message.html).toContain('href="http://localhost:3001/formateur/formations/f-1"');
    });

    it('donne le motif d’un échec, échappe le HTML, objet sur une ligne', async () => {
      await service.sendGenerationTermineeEmail('sami@cert-eet.local', {
        ...donnees,
        prenom: null,
        reussie: false,
        titreSupport: '<i>X</i>\r\nBcc: x@y.tn',
        motif: 'Délai <dépassé>.',
      });
      const message = dernierMessage();
      expect(message.subject).toMatch(/^Cert_EET — Génération impossible : /);
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.html).not.toContain('<i>X</i>');
      expect(message.text).toContain('Motif : Délai <dépassé>.');
    });
  });

  describe('sendStatutInscriptionEmail (US-INSC-02)', () => {
    it('suspension : motif repris, lien vers « Mes inscriptions »', async () => {
      await service.sendStatutInscriptionEmail('amel@cert-eet.local', {
        prenom: 'Amel',
        titreFormation: 'Back-end',
        suspendue: true,
        motif: 'Absences <répétées>',
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Inscription suspendue : « Back-end »');
      expect(message.text).toContain('Motif : Absences <répétées>');
      expect(message.html).not.toContain('<répétées>');
      expect(message.html).toContain('href="http://localhost:3001/mes-inscriptions"');
    });

    it('réactivation : sans motif', async () => {
      await service.sendStatutInscriptionEmail('amel@cert-eet.local', {
        prenom: null,
        titreFormation: 'Back-end',
        suspendue: false,
        motif: 'ignoré',
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Inscription réactivée : « Back-end »');
      expect(message.text).not.toContain('Motif');
      expect(message.text).toContain('Bonjour,');
    });
  });

  describe('sendDesinscriptionFormateurEmail (US-INSC-03)', () => {
    it('prévient le formateur, objet sur une ligne, HTML échappé', async () => {
      await service.sendDesinscriptionFormateurEmail('sami@cert-eet.local', {
        prenomFormateur: 'Sami',
        nomApprenant: 'Amel <b>Ben Ali</b>',
        titreFormation: 'Back-end\r\nBcc: x@y.tn',
      });
      const message = dernierMessage();
      expect(message.subject).toMatch(/^Cert_EET — Désinscription : /);
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.text).toContain('Bonjour Sami,');
      expect(message.html).not.toContain('<b>Ben Ali</b>');
      expect(message.html).toContain('href="http://localhost:3001/formateur/formations"');
    });
  });

  describe('sendRapportPretEmail (US-RPT-01)', () => {
    it('annonce le rapport prêt et mène à « Mes rapports », sans pièce jointe', async () => {
      await service.sendRapportPretEmail('sami@cert-eet.local', {
        prenom: 'Sami',
        titreFormation: 'Back-end',
        nomFichier: 'rapport-back-end-global-2026-11-10.csv',
        reussi: true,
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Rapport prêt : « Back-end »');
      expect(message.text).toContain('rapport-back-end-global-2026-11-10.csv');
      expect(message.html).toContain('href="http://localhost:3001/rapports"');
      expect(Object.keys(message)).not.toContain('attachments');
    });

    it('échec : objet sur une ligne, HTML échappé', async () => {
      await service.sendRapportPretEmail('sami@cert-eet.local', {
        prenom: null,
        titreFormation: '<b>F</b>\r\nBcc: x@y.tn',
        nomFichier: null,
        reussi: false,
      });
      const message = dernierMessage();
      expect(message.subject).toMatch(/^Cert_EET — Rapport non généré : /);
      expect(message.subject).not.toMatch(/[\r\n]/);
      expect(message.html).not.toContain('<b>F</b>');
      expect(message.text).toContain('Bonjour,');
    });
  });

  describe('sendAlertesDecrochageEmail (US-SUIVI-02)', () => {
    it('récapitule les alertes et mène à la page des alertes', async () => {
      await service.sendAlertesDecrochageEmail('sami@cert-eet.local', {
        prenom: 'Sami',
        alertes: [
          { apprenant: 'Amel Abidi', formation: 'Back-end', critere: 'INACTIVITE' },
          { apprenant: 'Bilel', formation: 'Back-end', critere: 'ECHECS_QCM' },
        ],
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — 2 nouvelles alertes de décrochage');
      expect(message.text).toContain('Bonjour Sami,');
      expect(message.text).toContain(
        '- Amel Abidi — Back-end : aucune connexion depuis plus de 7 jours',
      );
      expect(message.text).toContain('- Bilel — Back-end : deux échecs consécutifs au QCM');
      expect(message.html).toContain('href="http://localhost:3001/formateur/alertes"');
    });

    it('une alerte : singulier ; échappe le HTML ; noms sur une ligne', async () => {
      await service.sendAlertesDecrochageEmail('sami@cert-eet.local', {
        prenom: null,
        alertes: [{ apprenant: '<b>X</b>\r\nY', formation: 'F', critere: 'SCORE_EN_CHUTE' }],
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — 1 nouvelle alerte de décrochage');
      expect(message.html).not.toContain('<b>X</b>');
      expect(message.text).toContain('<b>X</b> Y — F : note en forte baisse');
    });
  });

  describe('sendMotDePasseModifieEmail (US-AUTH-08)', () => {
    it('prévient le titulaire, échappe le prénom et mène à la connexion', async () => {
      await service.sendMotDePasseModifieEmail('u@cert-eet.local', { prenom: '<i>Iyed</i>' });
      const message = dernierMessage();
      expect(message.to).toBe('u@cert-eet.local');
      expect(message.subject).toBe('Cert_EET — Votre mot de passe a été modifié');
      expect(message.text).toContain('toutes vos sessions ont été déconnectées');
      expect(message.text).toContain('http://localhost:3001/login');
      expect(message.html).toContain('href="http://localhost:3001/login"');
      expect(message.html).not.toContain('<i>Iyed</i>');
      expect(message.html).toContain('&lt;i&gt;Iyed&lt;/i&gt;');
    });
  });

  describe('sendReinitialisationMotDePasseEmail (US-AUTH-06)', () => {
    it('contient le lien, sa durée, et échappe le prénom', async () => {
      await service.sendReinitialisationMotDePasseEmail('u@cert-eet.local', {
        prenom: '<b>A</b>',
        lien: 'http://localhost:3001/reinitialiser-mot-de-passe?token=abc',
        minutes: 30,
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Réinitialisation de votre mot de passe');
      expect(message.text).toContain('http://localhost:3001/reinitialiser-mot-de-passe?token=abc');
      expect(message.text).toContain('30 minutes');
      expect(message.html).toContain('href="http://localhost:3001/reinitialiser-mot-de-passe?token=abc"');
      expect(message.html).not.toContain('<b>A</b>');
    });
  });

  describe('sendActivationCompteEmail (US-CPT-02)', () => {
    it('contient le lien et sa durée, échappe le prénom', async () => {
      await service.sendActivationCompteEmail('u@cert-eet.local', {
        prenom: '<b>A</b>',
        lien: 'http://localhost:3001/activer-compte?token=abc',
        heures: 48,
      });
      const message = dernierMessage();
      expect(message.subject).toBe('Cert_EET — Activez votre compte');
      expect(message.text).toContain('48 heures');
      expect(message.html).toContain('href="http://localhost:3001/activer-compte?token=abc"');
      expect(message.html).not.toContain('<b>A</b>');
    });
  });
});

import { MailConfig } from '../config/configuration';
import { construireOptionsSmtp } from './options-smtp';

/**
 * DEPLOY-smtp-auth — options du transporteur SMTP : Mailhog inchangé sans
 * identifiants, authentification + TLS obligatoire avec identifiants.
 */
describe('construireOptionsSmtp (DEPLOY-smtp-auth)', () => {
  const base: MailConfig = {
    host: 'mailhog',
    port: 1025,
    from: 'Cert_EET <no-reply@cert-eet.local>',
    appBaseUrl: 'https://localhost',
    secure: false,
  };

  it('sans identifiants (Mailhog) : connexion simple, ni auth ni TLS imposé, délais bornés', () => {
    const options = construireOptionsSmtp(base);
    expect(options).toEqual({
      host: 'mailhog',
      port: 1025,
      secure: false,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
    expect(options).not.toHaveProperty('auth');
    expect(options).not.toHaveProperty('requireTLS');
  });

  it('avec identifiants sur 587 : authentification et STARTTLS exigé', () => {
    const options = construireOptionsSmtp({
      ...base,
      host: 'smtp.gmail.com',
      port: 587,
      user: 'expediteur@gmail.com',
      password: 'mot-de-passe-application',
    });
    expect(options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'expediteur@gmail.com', pass: 'mot-de-passe-application' },
      connectionTimeout: 5_000,
    });
  });

  it('avec identifiants et SMTP_SECURE (465) : TLS implicite, pas de STARTTLS', () => {
    const options = construireOptionsSmtp({
      ...base,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'expediteur@gmail.com',
      password: 'mot-de-passe-application',
    });
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
    expect(options.auth).toEqual({ user: 'expediteur@gmail.com', pass: 'mot-de-passe-application' });
  });

  it.each([
    ['identifiant seul', { user: 'expediteur@gmail.com' }],
    ['mot de passe seul', { password: 'mot-de-passe-application' }],
    ['valeurs vides', { user: '', password: '' }],
  ])('%s : aucune authentification envoyée', (_cas, extra) => {
    const options = construireOptionsSmtp({ ...base, ...extra });
    expect(options).not.toHaveProperty('auth');
    expect(options).not.toHaveProperty('requireTLS');
  });
});

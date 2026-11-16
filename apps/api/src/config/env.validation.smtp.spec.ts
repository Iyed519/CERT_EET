import { envValidationSchema } from './env.validation';

/**
 * DEPLOY-smtp-auth — variables d'authentification SMTP : facultatives (Mailhog
 * en dev et en CI), mais un identifiant sans mot de passe refuse le démarrage.
 */
describe('envValidationSchema — SMTP (DEPLOY-smtp-auth)', () => {
  const valider = (
    env: Record<string, string>,
  ): { erreur?: string; valeur: Record<string, unknown> } => {
    const { error, value } = envValidationSchema.validate(env, {
      allowUnknown: true,
      abortEarly: false,
    });
    const erreurSmtp = error?.details.find((d) => /^SMTP_/.test(String(d.path[0])));
    return { erreur: erreurSmtp?.message, valeur: value as Record<string, unknown> };
  };

  it('par défaut (Mailhog) : aucune authentification, SMTP_SECURE faux, port 1025', () => {
    const { erreur, valeur } = valider({ SMTP_HOST: 'mailhog' });
    expect(erreur).toBeUndefined();
    expect(valeur).toMatchObject({ SMTP_PORT: 1025, SMTP_SECURE: false });
    expect(valeur.SMTP_USER).toBeUndefined();
    expect(valider({ SMTP_HOST: 'mailhog', SMTP_USER: '', SMTP_PASSWORD: '' }).erreur).toBeUndefined();
  });

  it('identifiant et mot de passe (Gmail, 587) : acceptés', () => {
    const { erreur, valeur } = valider({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_USER: 'expediteur@gmail.com',
      SMTP_PASSWORD: 'mot-de-passe-application',
    });
    expect(erreur).toBeUndefined();
    expect(valeur).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: false });
  });

  it.each([
    ['absent', {}],
    ['vide', { SMTP_PASSWORD: '' }],
  ])('identifiant sans mot de passe (%s) : démarrage refusé', (_cas, env) => {
    expect(
      valider({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'expediteur@gmail.com', ...env }).erreur,
    ).toBe('SMTP_PASSWORD est obligatoire quand SMTP_USER est fourni.');
  });

  it('SMTP_SECURE : true accepté (465), valeur non booléenne refusée', () => {
    expect(valider({ SMTP_HOST: 'smtp.gmail.com', SMTP_SECURE: 'true' }).valeur.SMTP_SECURE).toBe(
      true,
    );
    expect(valider({ SMTP_HOST: 'smtp.gmail.com', SMTP_SECURE: 'peut-etre' }).erreur).toBeDefined();
  });
});

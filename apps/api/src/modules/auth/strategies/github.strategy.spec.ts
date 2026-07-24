import { ConfigService } from '@nestjs/config';
import { Profile } from 'passport-github2';
import { GithubStrategy } from './github.strategy';
/**
 * Tests unitaires de GithubStrategy (US-AUTH-14).
 *
 * On teste UNIQUEMENT la normalisation `validate()` : c'est le seul code métier
 * propre à GitHub. Le reste du flux (find-link-or-create, session) est générique
 * et déjà couvert par les tests d'AuthService.loginWithOauth.
 *
 * Particularité GitHub : pas de nom/prénom structurés. On découpe `displayName`
 * (ou `username` à défaut) ; l'email peut être absent (compte au mail privé).
 */
describe('GithubStrategy — US-AUTH-14', () => {
  // ConfigService factice : la stratégie lit oauthGithub au constructeur.
  const configService = {
    getOrThrow: jest.fn().mockReturnValue({
      clientId: 'dummy-id',
      clientSecret: 'dummy-secret',
      callbackUrl: 'https://localhost/api/auth/oauth/github/callback',
    }),
  } as unknown as ConfigService;
  const strategy = new GithubStrategy(configService);
  // Fabrique un profil GitHub partiel (les champs non utilisés sont ignorés).
  const profil = (over: Partial<Profile>): Profile =>
    ({
      id: 'gh-123',
      username: 'iyed',
      displayName: 'Iyed Omri',
      emails: [{ value: 'omri.iyed@esprit.tn' }],
      ...over,
    }) as unknown as Profile;
  it('normalise un profil complet : displayName -> prénom + nom, 1er email', () => {
    const res = strategy.validate('access', 'refresh', profil({}));
    expect(res).toEqual({
      provider: 'github',
      providerId: 'gh-123',
      email: 'omri.iyed@esprit.tn',
      prenom: 'Iyed',
      nom: 'Omri',
    });
  });
  it('nom composé : prénom = 1er mot, nom = le reste', () => {
    const res = strategy.validate(
      'access',
      'refresh',
      profil({ displayName: 'Iyed Ben Omri' }),
    );
    expect(res.prenom).toBe('Iyed');
    expect(res.nom).toBe('Ben Omri');
  });
  it('sans displayName : repli sur username, nom null', () => {
    const res = strategy.validate(
      'access',
      'refresh',
      profil({ displayName: undefined }),
    );
    expect(res.prenom).toBe('iyed');
    expect(res.nom).toBeNull();
  });
  it('email privé (absent) : email = null (loginWithOauth refusera si pas de lien)', () => {
    const res = strategy.validate(
      'access',
      'refresh',
      profil({ emails: undefined }),
    );
    expect(res.email).toBeNull();
    expect(res.providerId).toBe('gh-123');
  });
});

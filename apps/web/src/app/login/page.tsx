/**
 * Coquille de la page de connexion (US-INFRA-02).
 *
 * Périmètre INF02 : structure visuelle uniquement. La logique d'authentification
 * (appel POST /auth/login, stockage de l'access token en mémoire + refresh en
 * cookie httpOnly, gestion MFA optionnelle) sera implémentée en US-AUTH-01.
 * Le formulaire n'est volontairement pas câblé à ce stade.
 */
export default function LoginPage(): JSX.Element {
  return (
    <section
      style={{
        maxWidth: 380,
        margin: '2rem auto',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '2rem',
      }}
    >
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Connexion</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Accédez à votre espace Cert_EET.
      </p>

      <form style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Adresse e-mail</span>
          <input
            type="email"
            name="email"
            placeholder="prenom.nom@exemple.tn"
            autoComplete="email"
            disabled
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            disabled
            style={inputStyle}
          />
        </label>

        <button type="button" disabled style={buttonStyle}>
          Se connecter
        </button>
      </form>

      <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '1rem' }}>
        Formulaire non actif — sera câblé en US-AUTH-01.
      </p>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: '0.95rem',
};

const buttonStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.7rem',
  border: 'none',
  borderRadius: 8,
  background: 'var(--primary)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'not-allowed',
  opacity: 0.7,
};

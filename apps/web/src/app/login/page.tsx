'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest, LoginError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Page de connexion (US-AUTH-01).
 *
 * Câble enfin le formulaire laissé inactif depuis US-INFRA-02 : appel
 * réel à POST /auth/login (via lib/api.ts), stockage de la session dans
 * AuthContext (access token en mémoire uniquement), puis redirection.
 *
 * 'use client' : formulaire interactif (useState, onSubmit) — impossible
 * en Server Component (App Router, INF02).
 *
 * Redirection après connexion : le Gherkin du backlog prévoit une
 * redirection "vers son espace selon son rôle" (ex: /apprenant,
 * /formateur, /administrateur). Ces espaces n'existent pas encore dans
 * le projet (aucune story ne les a créés à ce stade) — je redirige donc
 * vers l'accueil ("/") pour l'instant. Le point d'extension est marqué
 * ci-dessous : à remplacer par un aiguillage par rôle dès que ces pages
 * existeront (story future).
 */
export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const { setSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);

    try {
      const session = await loginRequest(email, password);
      setSession(session);

      // Point d'extension : redirection par rôle (session.user.role) une
      // fois que /apprenant, /formateur, /administrateur existeront.
      router.push('/');
    } catch (error) {
      // Le message vient tel quel du backend : il est déjà générique par
      // conception (sécurité par opacité, DS-01) — je ne le personnalise
      // pas ici pour ne pas réintroduire une fuite d'information côté
      // frontend.
      if (error instanceof LoginError) {
        setErreur(error.message);
      } else {
        setErreur('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setEnCours(false);
    }
  }

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

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Adresse e-mail</span>
          <input
            type="email"
            name="email"
            placeholder="prenom.nom@exemple.tn"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
        </label>

        {erreur !== null && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: 0 }}>
            {erreur}
          </p>
        )}

        <button
          type="submit"
          disabled={enCours}
          style={{
            ...buttonStyle,
            opacity: enCours ? 0.7 : 1,
            cursor: enCours ? 'not-allowed' : 'pointer',
          }}
        >
          {enCours ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
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
};
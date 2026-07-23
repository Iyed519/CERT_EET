'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest, LoginError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
/** Page de connexion (US-AUTH-01). */
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
      router.push('/');
    } catch (error) {
      setErreur(
        error instanceof LoginError
          ? error.message
          : 'Une erreur est survenue. Veuillez réessayer.',
      );
    } finally {
      setEnCours(false);
    }
  }
  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <span className="auth-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </span>
        <h1 className="auth-title">Bon retour</h1>
        <p className="auth-subtitle">
          Connectez-vous pour accéder à votre espace Cert_EET.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="email">Adresse e-mail</label>
            <input id="email" className="input" type="email" name="email"
              placeholder="prenom.nom@exemple.tn" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={enCours} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Mot de passe</label>
            <input id="password" className="input" type="password" name="password"
              autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={enCours} />
          </div>
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="auth-alt">
          Pas encore de compte ? <a href="/register">Créer un compte</a>
        </p>
      </section>
    </div>
  );
}

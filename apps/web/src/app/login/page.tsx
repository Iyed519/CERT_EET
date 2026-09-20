'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  loginRequest,
  mfaVerifyRequest,
  isMfaChallenge,
  LoginError,
} from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
/** Page de connexion (US-AUTH-01, MFA US-AUTH-02, OAuth US-AUTH-14). */
export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // US-AUTH-02 : 2e étape. mfaToken != null => on affiche l'écran code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const result = await loginRequest(email, password);
      if (isMfaChallenge(result)) {
        // Mot de passe OK mais MFA active : écran code, aucun jeton émis.
        setMfaToken(result.mfaToken);
      } else {
        setSession(result);
        router.push('/');
      }
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

  async function handleMfaSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!mfaToken) {
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      const session = await mfaVerifyRequest(mfaToken, code);
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

  function annulerMfa(): void {
    // Retour à l'écran identifiants (le mfaToken expirera seul côté Redis).
    setMfaToken(null);
    setCode('');
    setPassword('');
    setErreur(null);
  }

  // --- Écran 2 : code MFA ---
  if (mfaToken) {
    return (
      <div className="auth-wrap">
        <section className="auth-card">
          <span className="auth-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <h1 className="auth-title">Vérification en deux étapes</h1>
          <p className="auth-subtitle">
            Saisissez le code à 6 chiffres de votre application
            d’authentification.
          </p>
          <form className="form" onSubmit={handleMfaSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="code">
                Code de vérification
              </label>
              <input
                id="code"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={enCours}
              />
            </div>
            {erreur !== null && <p className="alert alert-error">{erreur}</p>}
            <button
              className="btn"
              type="submit"
              disabled={enCours || code.length !== 6}
            >
              {enCours ? 'Vérification…' : 'Vérifier'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              className="btn-sm btn-ghost"
              type="button"
              onClick={annulerMfa}
              disabled={enCours}
            >
              ← Revenir à la connexion
            </button>
          </div>
        </section>
      </div>
    );
  }

  // --- Écran 1 : identifiants ---
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
        <div className="oauth-sep">ou</div>
        <a className="btn-oauth" href="/api/auth/oauth/google">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continuer avec Google
        </a>
        <a className="btn-oauth btn-oauth-github" href="/api/auth/oauth/github">
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Continuer avec GitHub
        </a>
        <p className="auth-alt">
          Pas encore de compte ? <a href="/register">Créer un compte</a>
        </p>
      </section>
    </div>
  );
}

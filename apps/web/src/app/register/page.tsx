'use client';
import { useState, FormEvent } from 'react';
import { registerRequest, RegisterError } from '../../lib/api';
/** Page d'auto-inscription publique (US-CPT-05 + inscription Google US-AUTH-14). */
export default function RegisterPage(): JSX.Element {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [succes, setSucces] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await registerRequest({ nom, prenom, email, password });
      setSucces(true);
    } catch (error) {
      setErreur(
        error instanceof RegisterError
          ? error.message
          : 'Une erreur est survenue. Veuillez réessayer.',
      );
    } finally {
      setEnCours(false);
    }
  }
  if (succes) {
    return (
      <div className="auth-wrap">
        <section className="auth-card">
          <span className="auth-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </span>
          <h1 className="auth-title">Vérifiez votre email</h1>
          <p className="auth-subtitle">
            Un email de vérification a été envoyé à <strong>{email}</strong>.
            Cliquez sur le lien reçu pour activer votre compte, puis connectez-vous.
          </p>
          <p className="auth-alt"><a href="/login">Aller à la connexion</a></p>
        </section>
      </div>
    );
  }
  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <span className="auth-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </span>
        <h1 className="auth-title">Créer un compte</h1>
        <p className="auth-subtitle">Rejoignez Cert_EET et commencez à apprendre.</p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="prenom">Prénom</label>
            <input id="prenom" className="input" type="text" name="prenom"
              autoComplete="given-name" required maxLength={100}
              value={prenom} onChange={(e) => setPrenom(e.target.value)} disabled={enCours} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="nom">Nom</label>
            <input id="nom" className="input" type="text" name="nom"
              autoComplete="family-name" required maxLength={100}
              value={nom} onChange={(e) => setNom(e.target.value)} disabled={enCours} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="reg-email">Adresse e-mail</label>
            <input id="reg-email" className="input" type="email" name="email"
              placeholder="prenom.nom@exemple.tn" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={enCours} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="reg-password">Mot de passe</label>
            <input id="reg-password" className="input" type="password" name="password"
              autoComplete="new-password" required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={enCours} />
            <span className="field-hint">Au moins 8 caractères, avec une lettre et un chiffre.</span>
          </div>
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? 'Création…' : 'Créer mon compte'}
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
        <p className="auth-alt">Déjà un compte ? <a href="/login">Se connecter</a></p>
      </section>
    </div>
  );
}

'use client';
import { useState, FormEvent } from 'react';
import { registerRequest, RegisterError } from '../../lib/api';
/** Page d'auto-inscription publique (US-CPT-05, ADR-11). */
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
        <p className="auth-alt">Déjà un compte ? <a href="/login">Se connecter</a></p>
      </section>
    </div>
  );
}

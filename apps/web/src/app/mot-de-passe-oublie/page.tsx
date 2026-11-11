'use client';
import { FormEvent, useState } from 'react';
import { demanderReinitialisation, MotDePasseOublieError } from '../../lib/api';

/**
 * US-AUTH-06 — Demande d'un lien de réinitialisation. La réponse affichée est
 * la même que le compte existe ou non (anti-énumération).
 */
export default function MotDePasseOubliePage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      setMessage(await demanderReinitialisation(email));
    } catch (error) {
      setErreur(
        error instanceof MotDePasseOublieError
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
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3L22 7l-3-3" />
          </svg>
        </span>
        <h1 className="auth-title">Mot de passe oublié</h1>
        {message !== null ? (
          <>
            <p className="alert alert-success">{message}</p>
            <p className="auth-alt">
              Pensez à vérifier vos courriers indésirables.{' '}
              <a href="/login">Retour à la connexion</a>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              Saisissez l’adresse de votre compte : nous vous enverrons un lien
              pour choisir un nouveau mot de passe.
            </p>
            <form className="form" onSubmit={envoyer}>
              <div className="field">
                <label className="field-label" htmlFor="email">Adresse e-mail</label>
                <input id="email" className="input" type="email" name="email"
                  placeholder="prenom.nom@exemple.tn" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} disabled={enCours} />
              </div>
              {erreur !== null && <p className="alert alert-error">{erreur}</p>}
              <button className="btn" type="submit" disabled={enCours}>
                {enCours ? 'Envoi…' : 'Recevoir un lien'}
              </button>
            </form>
            <p className="auth-alt">
              <a href="/login">← Retour à la connexion</a>
            </p>
          </>
        )}
      </section>
    </div>
  );
}

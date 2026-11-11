'use client';
import { FormEvent, useEffect, useState } from 'react';
import { MotDePasseOublieError, activerCompte } from '../../lib/api';

/** Même politique que l'API (US-CPT-02, US-AUTH-06 / 08), vérifiée ici pour guider la saisie. */
function problemePolitique(motDePasse: string): string | null {
  if (motDePasse.length < 8) return 'Au moins 8 caractères.';
  if (motDePasse.length > 72) return '72 caractères au plus.';
  if (!/[A-Za-z]/.test(motDePasse) || !/\d/.test(motDePasse)) {
    return 'Au moins une lettre et un chiffre.';
  }
  return null;
}

/**
 * US-CPT-02 — Activation d'un compte créé par un administrateur : choix du mot de passe depuis le lien reçu par email.
 * Le jeton est lu dans l'URL au montage puis retiré de la barre d'adresse
 * (historique), sans useSearchParams (qui imposerait une frontière Suspense).
 */
export default function ActiverComptePage(): JSX.Element {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const valeur = new URLSearchParams(window.location.search).get('token');
    setToken(valeur && valeur.length > 0 ? valeur : null);
    if (valeur) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const probleme = nouveau.length > 0 ? problemePolitique(nouveau) : null;
  const pret = nouveau.length > 0 && probleme === null && confirmation === nouveau;

  async function valider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token || !pret) return;
    setErreur(null);
    setEnCours(true);
    try {
      setSucces(await activerCompte(token, nouveau));
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h1 className="auth-title">Activer mon compte</h1>
        {token === undefined ? (
          <p className="auth-subtitle">Chargement…</p>
        ) : succes !== null ? (
          <>
            <p className="alert alert-success">{succes}</p>
            <a className="btn" href="/login">Se connecter</a>
          </>
        ) : token === null ? (
          <>
            <p className="alert alert-error">
              Ce lien est incomplet. Ouvrez le lien reçu par email, ou demandez-en un nouveau à un administrateur.
            </p>
            <p className="auth-alt">
              <a href="/login">Aller à la connexion</a>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              Bienvenue sur Cert_EET ! Choisissez le mot de passe de votre compte
              seront ensuite déconnectées.
            </p>
            <form className="form" onSubmit={valider}>
              <div className="field">
                <label className="field-label" htmlFor="nouveau">Nouveau mot de passe</label>
                <input id="nouveau" className="input" type="password" autoComplete="new-password"
                  required maxLength={72} value={nouveau} disabled={enCours}
                  onChange={(e) => setNouveau(e.target.value)} aria-describedby="regle" />
                <span className="field-hint" id="regle">
                  {probleme ?? 'Au moins 8 caractères, dont une lettre et un chiffre.'}
                </span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="confirmation">Confirmer le mot de passe</label>
                <input id="confirmation" className="input" type="password" autoComplete="new-password"
                  required maxLength={72} value={confirmation} disabled={enCours}
                  onChange={(e) => setConfirmation(e.target.value)} />
                {confirmation.length > 0 && confirmation !== nouveau && (
                  <span className="field-hint">Les deux saisies ne correspondent pas.</span>
                )}
              </div>
              {erreur !== null && (
                <p className="alert alert-error">
                  {erreur}
                </p>
              )}
              <button className="btn" type="submit" disabled={enCours || !pret}>
                {enCours ? 'Activation…' : 'Activer mon compte'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

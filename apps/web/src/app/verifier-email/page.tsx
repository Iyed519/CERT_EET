'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyEmailRequest, VerifyEmailError } from '../../lib/api';
type Etat = 'chargement' | 'succes' | 'erreur';
/** Page de vérification d'email (US-CPT-05). Le lien de l'email arrive ici. */
function VerificationContenu(): JSX.Element {
  const params = useSearchParams();
  const token = params.get('token');
  const [etat, setEtat] = useState<Etat>('chargement');
  const [message, setMessage] = useState('');
  const dejaLance = useRef(false);
  useEffect(() => {
    if (dejaLance.current) return;
    dejaLance.current = true;
    if (!token) {
      setEtat('erreur');
      setMessage('Lien de vérification invalide : jeton manquant.');
      return;
    }
    verifyEmailRequest(token)
      .then((res) => {
        setEtat('succes');
        setMessage(res.message);
      })
      .catch((error: unknown) => {
        setEtat('erreur');
        setMessage(
          error instanceof VerifyEmailError
            ? error.message
            : 'Une erreur est survenue. Veuillez réessayer.',
        );
      });
  }, [token]);
  return (
    <div className="auth-wrap">
      <section className="auth-card" style={{ textAlign: 'center' }}>
        {etat === 'chargement' && (
          <>
            <div className="spinner" aria-hidden="true"></div>
            <h1 className="auth-title">Vérification en cours…</h1>
            <p className="auth-subtitle">Un instant, nous activons votre compte.</p>
          </>
        )}
        {etat === 'succes' && (
          <>
            <span className="auth-icon auth-icon--center" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </span>
            <h1 className="auth-title">Adresse vérifiée</h1>
            <p className="auth-subtitle">{message}</p>
            <a className="btn" href="/login" style={{ display: 'inline-block' }}>
              Se connecter
            </a>
          </>
        )}
        {etat === 'erreur' && (
          <>
            <span className="auth-icon auth-icon--center auth-icon--danger" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <h1 className="auth-title">Lien invalide</h1>
            <p className="auth-subtitle">{message}</p>
            <p className="auth-alt"><a href="/register">Créer un compte</a></p>
          </>
        )}
      </section>
    </div>
  );
}
export default function VerifierEmailPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="auth-wrap">
          <section className="auth-card"><div className="spinner" aria-hidden="true"></div></section>
        </div>
      }
    >
      <VerificationContenu />
    </Suspense>
  );
}

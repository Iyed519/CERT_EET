'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyEmailRequest, VerifyEmailError } from '../../lib/api';
type Etat = 'chargement' | 'succes' | 'erreur';
/**
 * Page de vérification d'email (US-CPT-05). Le lien de l'email pointe ici avec
 * ?token=<uuid>. Au montage, on appelle POST /api/auth/verify-email : succès ->
 * compte activé ; échec -> jeton invalide/expiré/déjà utilisé.
 */
function VerificationContenu(): JSX.Element {
  const params = useSearchParams();
  const token = params.get('token');
  const [etat, setEtat] = useState<Etat>('chargement');
  const [message, setMessage] = useState('');
  const dejaLance = useRef(false);
  useEffect(() => {
    // Garde anti double-exécution : en dev, React StrictMode monte les effets
    // deux fois ; sans ce garde le 2e appel consommerait un jeton déjà utilisé
    // et afficherait une erreur alors que la vérification a bien réussi.
    if (dejaLance.current) {
      return;
    }
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
    <section style={cardStyle}>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>
        Vérification de votre adresse email
      </h1>
      {etat === 'chargement' && (
        <p style={{ color: 'var(--muted)' }}>Vérification en cours...</p>
      )}
      {etat === 'succes' && (
        <>
          <p style={{ color: '#1e7e34' }}>{message}</p>
          <a href="/login" style={{ color: 'var(--primary)' }}>
            Aller à la connexion
          </a>
        </>
      )}
      {etat === 'erreur' && (
        <>
          <p style={{ color: '#c0392b' }}>{message}</p>
          <a href="/register" style={{ color: 'var(--primary)' }}>
            Créer un compte
          </a>
        </>
      )}
    </section>
  );
}
export default function VerifierEmailPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <section style={cardStyle}>
          <p>Chargement...</p>
        </section>
      }
    >
      <VerificationContenu />
    </Suspense>
  );
}
const cardStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: '2rem auto',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '2rem',
};

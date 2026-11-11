'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { bootstrapSession } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { CLE_SUITE_OAUTH, destinationApresConnexion } from '../../../lib/acces';

/** US-NAV-01 : page demandée avant le départ chez le fournisseur (lue une fois). */
function lireSuite(): string | null {
  try {
    const suite = window.sessionStorage.getItem(CLE_SUITE_OAUTH);
    window.sessionStorage.removeItem(CLE_SUITE_OAUTH);
    return suite;
  } catch {
    return null;
  }
}
/**
 * US-AUTH-14 — Atterrissage après le callback OAuth backend. Le cookie refresh
 * est déjà posé ; on récupère l'access token (bootstrapSession), on ouvre la
 * session côté React, puis on redirige. Garde useRef : évite le double appel en
 * dev (React StrictMode) qui déclencherait une double rotation du refresh token.
 */
export default function OauthCallbackPage(): JSX.Element {
  const router = useRouter();
  const { setSession } = useAuth();
  const dejaLance = useRef(false);
  useEffect(() => {
    if (dejaLance.current) return;
    dejaLance.current = true;
    bootstrapSession()
      .then((session) => {
        if (session) {
          setSession(session);
          router.replace(destinationApresConnexion(session.user.role, lireSuite()));
        } else {
          router.replace('/login?erreur=oauth');
        }
      })
      .catch(() => {
        router.replace('/login?erreur=oauth');
      });
  }, [router, setSession]);
  return (
    <div className="auth-wrap">
      <section className="auth-card" style={{ textAlign: 'center' }}>
        <div className="spinner" aria-hidden="true"></div>
        <h1 className="auth-title">Connexion en cours…</h1>
        <p className="auth-subtitle">Un instant, nous ouvrons votre session.</p>
      </section>
    </div>
  );
}

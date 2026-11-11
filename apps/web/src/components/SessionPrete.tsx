'use client';
import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * US-AUTH-17 — Tant que la session n'est pas restaurée au chargement de la
 * page, aucune page n'est rendue : elle déciderait trop tôt (page publique à
 * la place de l'accueil du rôle, « Vous devez être connecté », appels à l'api
 * sans jeton). Un chargement neutre, sans texte de connexion, la remplace.
 */
export function SessionPrete({ children }: { children: ReactNode }): JSX.Element {
  const { chargement } = useAuth();
  if (chargement) {
    return (
      <div className="session-chargement" role="status" aria-live="polite">
        <span className="session-chargement-rond" aria-hidden="true" />
        <span className="sr-only">Chargement de votre session…</span>
      </div>
    );
  }
  return <>{children}</>;
}

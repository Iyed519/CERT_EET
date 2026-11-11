'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { decisionNavigation } from '../lib/acces';

/** Chargement neutre : ni page publique, ni écran de connexion. */
export function ChargementSession(): JSX.Element {
  return (
    <div className="session-chargement" role="status" aria-live="polite">
      <span className="session-chargement-rond" aria-hidden="true" />
      <span className="sr-only">Chargement de votre session…</span>
    </div>
  );
}

/**
 * US-AUTH-17 — Tant que la session n'est pas restaurée au chargement de la
 * page, aucune page n'est rendue : elle déciderait trop tôt (page publique à
 * la place de l'accueil du rôle, « Vous devez être connecté », appels à l'api
 * sans jeton). Un chargement neutre, sans texte de connexion, la remplace.
 *
 * US-NAV-01 — Une fois la session connue, une seule décision pour toutes les
 * pages (`decisionNavigation`) : connecté sur `/` ou une page de visiteur ->
 * sa page de rôle (ou la page demandée avant la connexion) ; page d'un autre
 * rôle -> sa page de rôle ; visiteur sur une page protégée -> connexion avec
 * retour. Pendant la redirection, le même chargement neutre : aucun
 * clignotement de la page quittée.
 */
export function SessionPrete({ children }: { children: ReactNode }): JSX.Element {
  const { chargement, user } = useAuth();
  const chemin = usePathname() ?? '/';
  const parametres = useSearchParams();
  const router = useRouter();
  const requete = parametres?.toString() ?? '';
  const decision = chargement
    ? null
    : decisionNavigation(chemin, requete ? `?${requete}` : '', user?.role ?? null);
  const vers = decision?.type === 'rediriger' ? decision.vers : null;

  useEffect(() => {
    if (vers) router.replace(vers);
  }, [vers, router]);

  if (chargement || vers) return <ChargementSession />;
  return <>{children}</>;
}

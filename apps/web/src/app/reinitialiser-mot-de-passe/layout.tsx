import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * US-AUTH-06 — Le lien porte le jeton dans l'URL : aucune adresse de
 * provenance (Referer) ne doit le transmettre à un autre site.
 */
export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe — Cert_EET',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}

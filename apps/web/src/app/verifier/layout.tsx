import type { Metadata } from 'next';

/**
 * US-CERT-05 — Les pages de vérification ne sont jamais indexées par les
 * moteurs de recherche (minimisation : un nom ne doit pas devenir
 * trouvable par une recherche), et aucun référent n'est transmis.
 */
export const metadata: Metadata = {
  title: 'Vérification de certificat — Cert_EET',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function VerifierLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}

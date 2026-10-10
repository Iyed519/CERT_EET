import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ProfilGate } from '../components/ProfilGate';
import { AdminNav } from '../components/AdminNav';
import { FormateurNav } from '../components/FormateurNav';
import { RoleRequestNav } from '../components/RoleRequestNav';
import { SecuriteNav } from '../components/SecuriteNav';
export const metadata: Metadata = {
  title: 'Cert_EET — Certification numérique vérifiable',
  description:
    'Plateforme de certification et de micro-certification numérique vérifiable.',
};
/**
 * Layout racine (App Router). Coquille : en-tête de marque + zone de contenu.
 * AuthProvider enveloppe toute l'application (US-AUTH-01).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <header className="site-header">
            <span className="brand-badge">CE</span>
            <span className="brand-name">Cert_EET</span>
            <AdminNav />
            <FormateurNav />
            <RoleRequestNav />
            <SecuriteNav />
          </header>
          <main className="site-main">{children}</main>
          <ProfilGate />
        </AuthProvider>
      </body>
    </html>
  );
}

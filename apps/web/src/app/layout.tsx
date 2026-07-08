import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Cert_EET — Certification numérique vérifiable',
  description:
    'Plateforme de certification et de micro-certification numérique vérifiable.',
};

/**
 * Layout racine (App Router). Coquille de base : en-tête + zone de contenu.
 * Les layouts par rôle (tableaux de bord apprenant/formateur/admin) seront
 * ajoutés au fil des sprints.
 *
 * AuthProvider (US-AUTH-01) enveloppe TOUTE l'application ici, dans le
 * layout racine : n'importe quelle page, même future, pourra utiliser
 * useAuth() pour savoir qui est connecté, sans avoir à reconfigurer quoi
 * que ce soit. RootLayout reste un Server Component (pas de 'use client'
 * ici) — Next.js App Router autorise un Server Component à rendre un
 * Client Component (AuthProvider) parmi ses enfants.
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
          <header
            style={{
              background: 'var(--bg)',
              color: '#fff',
              padding: '1rem 1.5rem',
              fontWeight: 600,
            }}
          >
            Cert_EET
          </header>
          <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
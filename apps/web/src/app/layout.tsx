import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cert_EET — Certification numérique vérifiable',
  description:
    'Plateforme de certification et de micro-certification numérique vérifiable.',
};

/**
 * Layout racine (App Router). Coquille de base : en-tête + zone de contenu.
 * Les layouts par rôle (tableaux de bord apprenant/formateur/admin) seront
 * ajoutés au fil des sprints.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="fr">
      <body>
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
      </body>
    </html>
  );
}

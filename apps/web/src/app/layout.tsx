import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ProfilGate } from '../components/ProfilGate';
import { ChargementSession, SessionPrete } from '../components/SessionPrete';
import { SiteHeader } from '../components/SiteHeader';
import { FilAriane } from '../components/FilAriane';
import { MiettesProvider } from '../components/TitrePage';
export const metadata: Metadata = {
  title: 'Cert_EET — Certification numérique vérifiable',
  description:
    'Plateforme de certification et de micro-certification numérique vérifiable.',
};
/**
 * Layout racine (App Router). Coquille : en-tête commun (navigation par rôle,
 * menu de compte), zone de contenu et pied de page. AuthProvider enveloppe
 * toute l'application (US-AUTH-01).
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
          <MiettesProvider>
          <SiteHeader />
          <main className="site-main">
            <FilAriane />
            <Suspense fallback={<ChargementSession />}>
              <SessionPrete>{children}</SessionPrete>
            </Suspense>
          </main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <span className="site-footer-marque">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="logo-esprit logo-esprit-sm"
                  src="/logo-esprit-bandeau.webp"
                  alt="ESPRIT — Se former autrement"
                  width={209}
                  height={86}
                />
                Cert_EET — ESPRIT Entreprise
              </span>
              <span>Certifications numériques vérifiables · données hébergées en Tunisie</span>
            </div>
          </footer>
          <ProfilGate />
          </MiettesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

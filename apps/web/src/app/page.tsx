import Link from 'next/link';

/**
 * Page d'accueil (coquille). Confirme que le frontend démarre (US-INFRA-02).
 */
export default function HomePage(): JSX.Element {
  return (
    <section>
      <h1>Cert_EET</h1>
      <p style={{ color: 'var(--muted)' }}>
        Plateforme de certification numérique vérifiable. Squelette applicatif
        (Sprint 1 · INF02).
      </p>
      <p>
        <Link href="/login">Accéder à la connexion →</Link>
      </p>
    </section>
  );
}

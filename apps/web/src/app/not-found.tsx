import Link from 'next/link';

/**
 * US-QUAL-01 — Page « introuvable » (lien périmé, adresse mal saisie) : en
 * français, dans la coquille de l'application, avec un chemin de retour. Le
 * lien d'accueil mène à `/`, qui renvoie un utilisateur connecté vers la page
 * de son rôle (US-NAV-01).
 */
export default function PageIntrouvable(): JSX.Element {
  return (
    <div className="auth-wrap">
      <section className="auth-card" style={{ textAlign: 'center' }}>
        <span className="auth-icon auth-icon--center" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <h1 className="auth-title">Page introuvable</h1>
        <p className="auth-subtitle">
          Cette adresse ne correspond à aucune page de Cert_EET. Le lien est peut-être périmé ou
          mal recopié.
        </p>
        <p>
          <Link className="btn" href="/">
            Revenir à l’accueil
          </Link>
        </p>
      </section>
    </div>
  );
}

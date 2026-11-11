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

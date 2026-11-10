import Link from 'next/link';

const ATOUTS: Array<[string, string, string]> = [
  [
    'Des évaluations crédibles',
    'QCM chronométrés et surveillés, ateliers pratiques corrigés par un formateur sur une grille publique.',
    'M9 12l2 2 4-4M12 3l7 4v5c0 4.4-3 8.3-7 9-4-.7-7-4.6-7-9V7l7-4z',
  ],
  [
    'Des certificats vérifiables',
    'Chaque certificat porte une empreinte et un lien public : un recruteur le vérifie en un clic.',
    'M7 3h10a2 2 0 012 2v14l-7-3-7 3V5a2 2 0 012-2zM9 9h6M9 12h4',
  ],
  [
    'Un assistant pédagogique IA',
    'Le formateur génère des questions à partir de ses supports ; il valide chaque proposition.',
    'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M12 8a4 4 0 110 8 4 4 0 010-8z',
  ],
  [
    'Des données souveraines',
    'Plateforme hébergée en Tunisie pour ESPRIT Entreprise : vos parcours et vos résultats restent ici.',
    'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18M12 3a9 9 0 110 18 9 9 0 010-18z',
  ],
];

const ETAPES: Array<[string, string]> = [
  ['Inscrivez-vous', 'Choisissez une formation ouverte dans le catalogue.'],
  ['Apprenez', 'Suivez les modules, les ressources et les ateliers à votre rythme.'],
  ['Faites-vous évaluer', 'QCM et ateliers pratiques, notés selon des règles connues d’avance.'],
  ['Obtenez votre certificat', 'Émis automatiquement, vérifiable publiquement, téléchargeable en PDF.'],
];

/** Page d'accueil d'un visiteur non connecté. */
export function AccueilPublic(): JSX.Element {
  return (
    <div className="accueil">
      <section className="hero">
        <div className="hero-texte">
          <p className="hero-surtitre">ESPRIT Entreprise · Formation continue</p>
          <h1 className="hero-titre">
            Apprenez, prouvez vos compétences, <span>certifiez-les.</span>
          </h1>
          <p className="hero-sous-titre">
            Cert_EET réunit formations, évaluations sécurisées et certificats numériques
            vérifiables sur une seule plateforme.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="bouton bouton-plein">
              Créer mon compte
            </Link>
            <Link href="/login" className="bouton bouton-contour">
              Se connecter
            </Link>
          </div>
        </div>
        <div className="hero-visuel" aria-hidden="true">
          <div className="hero-carte">
            <div className="hero-carte-tete">
              <span className="brand-badge">CE</span>
              <span>Certificat de réussite</span>
            </div>
            <div className="hero-carte-ligne hero-carte-ligne-longue" />
            <div className="hero-carte-ligne" />
            <div className="hero-carte-pied">
              <span className="hero-carte-sceau">✓</span>
              <span className="hero-carte-verifie">Vérifié</span>
            </div>
          </div>
        </div>
      </section>

      <section className="accueil-section" aria-labelledby="atouts-titre">
        <h2 id="atouts-titre" className="accueil-section-titre">
          Pourquoi Cert_EET ?
        </h2>
        <div className="atouts">
          {ATOUTS.map(([titre, texte, icone]) => (
            <article key={titre} className="atout">
              <span className="atout-icone" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d={icone} />
                </svg>
              </span>
              <h3 className="atout-titre">{titre}</h3>
              <p className="atout-texte">{texte}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="accueil-section" aria-labelledby="etapes-titre">
        <h2 id="etapes-titre" className="accueil-section-titre">
          Comment ça marche
        </h2>
        <ol className="etapes">
          {ETAPES.map(([titre, texte], i) => (
            <li key={titre} className="etape">
              <span className="etape-numero">{i + 1}</span>
              <h3 className="etape-titre">{titre}</h3>
              <p className="etape-texte">{texte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bandeau-cta">
        <div>
          <h2 className="bandeau-cta-titre">Prêt à commencer ?</h2>
          <p className="bandeau-cta-texte">Créez votre compte apprenant en une minute.</p>
        </div>
        <Link href="/register" className="bouton bouton-blanc">
          Je m’inscris
        </Link>
      </section>
    </div>
  );
}

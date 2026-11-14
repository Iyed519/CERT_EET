/**
 * US-UX-01 — Jeu d'icônes de Cert_EET, en SVG inline (aucune dépendance).
 *
 * Tracés écrits à la main pour ce projet : grille de 24 × 24, trait de 2 px,
 * extrémités et angles arrondis, sans remplissage — toutes les icônes ont donc
 * le même poids. La couleur suit le texte (`currentColor`).
 *
 * Accessibilité : une icône est décorative par défaut (`aria-hidden`), le
 * texte voisin porte le sens. Pour une icône seule porteuse de sens, passer
 * `libelle` (elle devient `role="img"` avec ce nom) ; un bouton qui ne
 * contient qu'une icône doit avoir son propre `aria-label`.
 */
const TRACES = {
  accueil: <path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />,
  formation: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8M8 11h6" />
    </>
  ),
  module: <path d="m12 3 9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
  qcm: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 8 1.5 1.5L12 7M8 14l1.5 1.5L12 13M14.5 8.5H17M14.5 14.5H17" />
    </>
  ),
  atelier: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5a2.1 2.1 0 0 0 3 3l5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z" />,
  livrable: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M12 18v-6M9 14.5 12 12l3 2.5" />
    </>
  ),
  correction: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4M14 20h6" />
    </>
  ),
  ressource: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
    </>
  ),
  fichier: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  ia: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M12 7.5 13.4 10.6 16.5 12 13.4 13.4 12 16.5 10.6 13.4 7.5 12 10.6 10.6z" />
      <path d="m5.6 5.6 1.4 1.4M17 17l1.4 1.4" />
    </>
  ),
  apprenant: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  apprenants: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
    </>
  ),
  alerte: (
    <>
      <path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  cloche: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  rapport: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  risque: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  certificat: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="m8.5 13.8-1.5 7.2 5-2.5 5 2.5-1.5-7.2" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  securite: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  demande: (
    <>
      <path d="M3 13h5l2 3h4l2-3h5" />
      <path d="M5.5 5h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" />
    </>
  ),
  proposition: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  catalogue: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  parametres: (
    <>
      <path d="M4 6h9M19 6h1M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  publier: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  resultats: (
    <>
      <path d="M21 12A9 9 0 1 1 12 3v9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </>
  ),
  surveillance: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  ajouter: <path d="M12 5v14M5 12h14" />,
  'plus-actions': (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  modifier: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  supprimer: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  ouvrir: <path d="m9 6 6 6-6 6" />,
  'chevron-bas': <path d="m6 9 6 6 6-6" />,
  'chevron-haut': <path d="m6 15 6-6 6 6" />,
  'fleche-haut': <path d="M12 19V5M6 11l6-6 6 6" />,
  'fleche-bas': <path d="M12 5v14M6 13l6 6 6-6" />,
  'fleche-droite': <path d="M5 12h14M13 6l6 6-6 6" />,
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  filtre: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  calendrier: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  succes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  erreur: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  attente: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  brouillon: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 3l6 6v3M14 3v6h6M13 21l1-3 5.5-5.5a1.4 1.4 0 0 1 2 2L16 20z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  'reduire-menu': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 10l-2 2 2 2" />
    </>
  ),
  'deplier-menu': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M13 10l2 2-2 2" />
    </>
  ),
  telecharger: <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  importer: <path d="M12 15V4M7 9l5-5 5 5M4 20h16" />,
  banque: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  utilisateurs: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
    </>
  ),
  role: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2.5" />
      <path d="M5.5 16.5a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3" />
    </>
  ),
  connexion: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3" />,
  deconnexion: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 16l4-4-4-4M19 12H9" />,
  compte: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
    </>
  ),
  'lien-externe': <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  'tendance-hausse': <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  'tendance-baisse': <path d="m3 7 6 6 4-4 8 8M15 17h6v-6" />,
  'tendance-stable': <path d="M3 12h18M15 6l6 6-6 6" />,
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </>
  ),
  envoyer: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  historique: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  actualiser: <path d="M20 11a8 8 0 0 0-14.6-4.5L3 9M3 4v5h5M4 13a8 8 0 0 0 14.6 4.5L21 15M21 20v-5h-5" />,
  grille: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </>
  ),
  liste: <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  etoile: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  activite: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  pilotage: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </>
  ),
} as const;

export type NomIcone = keyof typeof TRACES;

/** Liste des noms disponibles (guide de style, tests). */
export const NOMS_ICONES = Object.keys(TRACES) as NomIcone[];

export function Icone({
  nom,
  taille = 20,
  libelle,
  className,
}: {
  nom: NomIcone;
  /** Côté en pixels (20 par défaut ; 16 dans un bouton compact, 24 dans un titre). */
  taille?: number;
  /** Nom accessible, seulement si l'icône porte seule le sens. */
  libelle?: string;
  className?: string;
}): JSX.Element {
  return (
    <svg
      className={`icone${className ? ` ${className}` : ''}`}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(libelle ? { role: 'img', 'aria-label': libelle } : { 'aria-hidden': true })}
    >
      {TRACES[nom]}
    </svg>
  );
}

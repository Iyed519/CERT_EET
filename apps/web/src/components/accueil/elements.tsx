import Link from 'next/link';
import { ReactNode } from 'react';
import { initiales } from '../navigation';

/** Moment de la journée pour la salutation. */
function bonjour(): string {
  const h = new Date().getHours();
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
}

/** Bandeau d'accueil d'un utilisateur connecté. */
export function Salutation({
  email,
  role,
  texte,
  children,
}: {
  email: string;
  role: string;
  texte: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <section className="salutation">
      <span className={`avatar avatar-xl avatar-${role}`} aria-hidden="true">
        {initiales(email)}
      </span>
      <div className="salutation-texte">
        <h1 className="salutation-titre">{bonjour()} 👋</h1>
        <p className="salutation-sous-titre">{texte}</p>
      </div>
      {children && <div className="salutation-actions">{children}</div>}
    </section>
  );
}

/** Indicateur chiffré cliquable. */
export function Tuile({
  valeur,
  libelle,
  href,
  ton,
}: {
  valeur: number | string;
  libelle: string;
  href: string;
  ton?: 'alerte';
}): JSX.Element {
  return (
    <Link href={href} className={`tuile${ton === 'alerte' ? ' tuile-alerte' : ''}`}>
      <span className="tuile-valeur">{valeur}</span>
      <span className="tuile-libelle">{libelle}</span>
    </Link>
  );
}

/** Raccourci vers une section (icône, titre, description). */
export function Raccourci({
  href,
  titre,
  texte,
  icone,
}: {
  href: string;
  titre: string;
  texte: string;
  icone: string;
}): JSX.Element {
  return (
    <Link href={href} className="raccourci">
      <span className="raccourci-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d={icone} />
        </svg>
      </span>
      <span className="raccourci-texte">
        <span className="raccourci-titre">{titre}</span>
        <span className="raccourci-description">{texte}</span>
      </span>
    </Link>
  );
}

/** Tracés d'icônes (24 × 24, trait). */
export const ICONES = {
  utilisateurs: 'M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8',
  formation: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5zM8 8h8M8 12h6',
  certificat: 'M7 3h10a2 2 0 012 2v14l-7-3-7 3V5a2 2 0 012-2zM9 9h6M9 12h4',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 13l2 2 4-4',
  rapport: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  ia: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M12 8a4 4 0 110 8 4 4 0 010-8z',
  demande: 'M12 8v4l3 3M12 3a9 9 0 110 18 9 9 0 010-18z',
  alerte: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  tableau: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
};

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { SOUS_NAVIGATION_ADMIN, sectionDe } from '../../components/navigation';

/**
 * Layout des pages d'administration.
 *
 * US-UI-03 : la barre de 11 onglets (doublon de l'en-tête) est remplacée par
 * une sous-navigation qui ne montre que les pages de la section courante
 * (Utilisateurs, Formations, Pilotage) ; les sections d'une seule page n'en
 * ont pas. Purement UI : la vraie barrière reste le RolesGuard côté API.
 */
export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const section = sectionDe('ADMINISTRATEUR', pathname);
  const onglets = section ? (SOUS_NAVIGATION_ADMIN[section.libelle] ?? []) : [];
  return (
    <div>
      {onglets.length > 1 && (
        <nav className="admin-tabs" aria-label={`Section ${section?.libelle ?? ''}`}>
          {onglets.map(([href, libelle]) => {
            const actif = pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
            return (
              <Link
                key={href}
                href={href}
                className={`admin-tab${actif ? ' admin-tab-active' : ''}`}
                aria-current={actif ? 'page' : undefined}
              >
                {libelle}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}

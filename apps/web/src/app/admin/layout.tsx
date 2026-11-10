'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

/**
 * Layout des pages d'administration (US-ROL-01, US-CPT-03, US-AUTH-12,
 * US-FORM-01, US-CERT-01 : suivi de l'émission des certificats, US-DASH-01 :
 * tableau de bord global, US-RPT-02 : rapports institutionnels).
 *
 * Ajoute une barre d'onglets commune pour naviguer entre les écrans admin
 * (Utilisateurs, Demandes de rôle, Formations, Journal d'audit) sans quitter
 * la section. Purement UI : la
 * vraie barrière reste le RolesGuard côté API (@Roles(ADMINISTRATEUR)).
 */
const ONGLETS: Array<[string, string]> = [
  ['/admin/tableau-de-bord', 'Tableau de bord'],
  ['/admin/utilisateurs', 'Utilisateurs'],
  ['/admin/role-requests', 'Demandes de rôle'],
  ['/admin/formations', 'Formations'],
  ['/admin/certificats', 'Certificats'],
  ['/admin/rapports', 'Rapports'],
  ['/admin/audit', "Journal d'audit"],
];

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const pathname = usePathname();
  return (
    <div>
      <nav className="admin-tabs" aria-label="Administration">
        {ONGLETS.map(([href, libelle]) => {
          const actif = pathname?.startsWith(href) ?? false;
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
      {children}
    </div>
  );
}

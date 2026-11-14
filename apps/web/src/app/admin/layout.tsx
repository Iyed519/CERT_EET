import { ReactNode } from 'react';

/**
 * Layout des pages d'administration.
 *
 * US-UX-02 : la sous-navigation par section (onglets Comptes / Demandes de
 * rôle…) est remplacée par le menu latéral, où chaque page a son entrée.
 * Purement UI : la vraie barrière reste le RolesGuard côté API.
 */
export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  return <div>{children}</div>;
}

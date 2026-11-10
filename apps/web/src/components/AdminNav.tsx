'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Lien « Administration » dans l'en-tête (US-ROL-01).
 *
 * Rendu UNIQUEMENT pour un ADMINISTRATEUR connecté (le rôle vient du contexte
 * d'auth, en mémoire). Le backend reste la vraie barrière (RolesGuard) : ce
 * lien n'est qu'un raccourci d'UI, pas un contrôle de sécurité. Masqué quand on
 * est déjà sur une page /admin. Mène au tableau de bord global (US-DASH-01).
 */
export function AdminNav(): JSX.Element | null {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user?.role !== 'ADMINISTRATEUR') {
    return null;
  }
  if (pathname?.startsWith('/admin')) {
    return null;
  }
  return (
    <Link className="header-link" href="/admin/tableau-de-bord">
      Administration
    </Link>
  );
}

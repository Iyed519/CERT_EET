'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Lien « Changer de rôle » dans l'en-tête (US-ROL-02).
 *
 * Affiché pour tout utilisateur connecté (le backend est la vraie barrière).
 * Masqué quand on est déjà sur /mon-role ou dans la section /admin.
 */
export function RoleRequestNav(): JSX.Element | null {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) {
    return null;
  }
  if (pathname?.startsWith('/mon-role') || pathname?.startsWith('/admin')) {
    return null;
  }
  return (
    <Link className="header-link" href="/mon-role">
      Changer de rôle
    </Link>
  );
}

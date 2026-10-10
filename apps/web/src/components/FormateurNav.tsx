'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Lien « Mes formations » dans l'en-tête (US-AUTH-16).
 *
 * Rendu UNIQUEMENT pour un FORMATEUR connecté (rôle lu dans le contexte
 * d'auth, en mémoire). Masqué quand on est déjà dans l'espace formateur. Le
 * backend reste la vraie barrière : @Roles(FORMATEUR) et l'autorisation par
 * ressource.
 */
export function FormateurNav(): JSX.Element | null {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user?.role !== 'FORMATEUR') {
    return null;
  }
  if (pathname?.startsWith('/formateur')) {
    return null;
  }
  return (
    <Link className="header-link" href="/formateur/formations">
      Mes formations
    </Link>
  );
}

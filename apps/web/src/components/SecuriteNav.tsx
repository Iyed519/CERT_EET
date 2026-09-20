'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Lien « Sécurité » dans l'en-tête (réglages MFA, US-AUTH-09).
 * Affiché pour tout utilisateur connecté ; masqué sur /securite et /admin.
 */
export function SecuriteNav(): JSX.Element | null {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) {
    return null;
  }
  if (pathname?.startsWith('/securite') || pathname?.startsWith('/admin')) {
    return null;
  }
  return (
    <Link className="header-link" href="/securite">
      Sécurité
    </Link>
  );
}

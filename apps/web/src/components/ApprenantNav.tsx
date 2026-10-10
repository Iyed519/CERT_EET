'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Liens « Catalogue » et « Mes inscriptions » dans l'en-tête (US-INSC-01).
 *
 * Rendus UNIQUEMENT pour un APPRENANT connecté (rôle lu dans le contexte
 * d'auth). Chaque lien est masqué sur sa propre page. Le backend reste la
 * vraie barrière : seul un apprenant peut s'inscrire (@Roles(APPRENANT)).
 */
export function ApprenantNav(): JSX.Element | null {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user?.role !== 'APPRENANT') {
    return null;
  }
  return (
    <>
      {!pathname?.startsWith('/catalogue') && (
        <Link className="header-link" href="/catalogue">
          Catalogue
        </Link>
      )}
      {!pathname?.startsWith('/mes-inscriptions') && (
        <Link className="header-link" href="/mes-inscriptions">
          Mes inscriptions
        </Link>
      )}
    </>
  );
}

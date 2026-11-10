'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Liens « Catalogue », « Mes inscriptions » (US-INSC-01), « Mes tentatives »
 * (US-QCM-11) et « Mes certificats » (US-CERT-03) dans l'en-tête.
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
      {!pathname?.startsWith('/mes-tentatives') && (
        <Link className="header-link" href="/mes-tentatives">
          Mes tentatives
        </Link>
      )}
      {!pathname?.startsWith('/mes-certificats') && (
        <Link className="header-link" href="/mes-certificats">
          Mes certificats
        </Link>
      )}
    </>
  );
}

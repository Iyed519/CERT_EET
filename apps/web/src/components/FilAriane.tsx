'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { filAriane } from './navigation';

/**
 * US-UI-03 — Fil d'Ariane de toute page interne d'un connecté :
 * Accueil › Section › Page (déduit du menu du rôle). Rien sur la page
 * d'accueil du rôle ni pour un visiteur.
 */
export function FilAriane(): JSX.Element | null {
  const { user } = useAuth();
  const chemin = usePathname();
  if (!user) return null;
  const miettes = filAriane(user.role, chemin);
  if (miettes.length === 0) return null;
  return (
    <nav className="fil-ariane" aria-label="Fil d’Ariane">
      <ol>
        {miettes.map((m, i) => {
          const derniere = i === miettes.length - 1 && chemin === m.href;
          return (
            <li key={m.href}>
              {derniere ? (
                <span aria-current="page">{m.libelle}</span>
              ) : (
                <Link href={m.href}>{m.libelle}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

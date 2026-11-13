'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { filAriane } from './navigation';
import { useMiettesCourantes } from './TitrePage';

/**
 * US-UI-03 — Fil d'Ariane de toute page interne d'un connecté :
 * Accueil › Section › Page (déduit du menu du rôle). Rien sur la page
 * d'accueil du rôle ni pour un visiteur.
 */
export function FilAriane(): JSX.Element | null {
  const { user } = useAuth();
  const chemin = usePathname();
  const ajoutees = useMiettesCourantes();
  if (!user) return null;
  const base = filAriane(user.role, chemin);
  if (base.length === 0) return null;
  // US-UI-04 : la page profonde ajoute ses miettes ; la dernière est la page courante.
  const miettes: Array<{ href?: string; libelle: string }> = [...base, ...ajoutees];
  return (
    <nav className="fil-ariane" aria-label="Fil d’Ariane">
      <ol>
        {miettes.map((m, i) => {
          const derniere = i === miettes.length - 1 && (!m.href || chemin === m.href);
          return (
            <li key={`${i}-${m.libelle}`}>
              {derniere || !m.href ? (
                <span aria-current={derniere ? 'page' : undefined}>{m.libelle}</span>
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

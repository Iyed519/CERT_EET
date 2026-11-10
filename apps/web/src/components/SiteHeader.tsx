'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logout, restaurerSession } from '../lib/api';
import { LIBELLE_ROLE, LIENS_PAR_ROLE, estActif, initiales } from './navigation';

/** Session restaurée une seule fois par chargement de l'application. */
let restaurationTentee = false;

/** Liens secondaires du menu de compte, par rôle. */
const LIENS_COMPTE: Record<string, Array<[string, string]>> = {
  APPRENANT: [
    ['/mon-role', 'Changer de rôle'],
    ['/securite', 'Sécurité du compte'],
  ],
  FORMATEUR: [
    ['/mon-role', 'Changer de rôle'],
    ['/securite', 'Sécurité du compte'],
  ],
  ADMINISTRATEUR: [
    ['/admin/role-requests', 'Demandes de rôle'],
    ['/admin/rapports', 'Rapports'],
    ['/admin/generations-ia', 'Générations IA'],
    ['/admin/audit', "Journal d'audit"],
    ['/securite', 'Sécurité du compte'],
  ],
};

/**
 * En-tête commun à toute l'application : marque, navigation du rôle,
 * recherche dans le catalogue, menu de compte (déconnexion) et menu mobile.
 * Remplace les liens isolés d'avant (AdminNav, ApprenantNav, FormateurNav,
 * RoleRequestNav, SecuriteNav). Purement UI : l'API reste la vraie barrière.
 */
export function SiteHeader(): JSX.Element {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuCompte, setMenuCompte] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [deconnexion, setDeconnexion] = useState(false);
  const compteRef = useRef<HTMLDivElement>(null);

  // Rechargement de page : la session (en mémoire seulement) est restaurée
  // par le cookie de refresh, sans redirection si le visiteur est anonyme.
  useEffect(() => {
    if (user || restaurationTentee) return;
    restaurationTentee = true;
    void restaurerSession();
  }, [user]);

  // Changement de page : les menus se ferment.
  useEffect(() => {
    setMenuCompte(false);
    setMenuMobile(false);
  }, [pathname]);

  // Clic à l'extérieur ou Échap : le menu de compte se ferme.
  useEffect(() => {
    if (!menuCompte && !menuMobile) return;
    function surClic(e: MouseEvent): void {
      if (compteRef.current && !compteRef.current.contains(e.target as Node)) {
        setMenuCompte(false);
      }
    }
    function surTouche(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setMenuCompte(false);
        setMenuMobile(false);
      }
    }
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [menuCompte, menuMobile]);

  const liens = user ? LIENS_PAR_ROLE[user.role] : [];
  const liensCompte = user ? (LIENS_COMPTE[user.role] ?? []) : [];

  function rechercher(e: FormEvent): void {
    e.preventDefault();
    const q = recherche.trim();
    router.push(q ? `/catalogue?q=${encodeURIComponent(q)}` : '/catalogue');
  }

  async function seDeconnecter(): Promise<void> {
    setDeconnexion(true);
    await logout();
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="topbar-burger"
          aria-label={menuMobile ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuMobile}
          aria-controls="menu-mobile"
          onClick={() => setMenuMobile((v) => !v)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        <Link href="/" className="topbar-brand" aria-label="Cert_EET — accueil">
          <span className="brand-badge">CE</span>
          <span className="brand-name">
            Cert<span className="brand-accent">_EET</span>
          </span>
        </Link>

        {user && (
          <form className="topbar-search" role="search" onSubmit={rechercher}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="topbar-search-icone">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <label htmlFor="recherche-catalogue" className="sr-only">
              Rechercher une formation
            </label>
            <input
              id="recherche-catalogue"
              type="search"
              className="topbar-search-input"
              placeholder="Rechercher une formation…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </form>
        )}

        <nav className="topbar-nav" aria-label="Navigation principale">
          {liens.map((lien) => {
            const actif = estActif(lien, pathname);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                className={`topbar-link${actif ? ' topbar-link-actif' : ''}`}
                aria-current={actif ? 'page' : undefined}
              >
                {lien.libelle}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-droite">
          {user ? (
            <div className="compte" ref={compteRef}>
              <button
                type="button"
                className="compte-bouton"
                aria-haspopup="menu"
                aria-expanded={menuCompte}
                onClick={() => setMenuCompte((v) => !v)}
              >
                <span className={`avatar avatar-${user.role}`} aria-hidden="true">
                  {initiales(user.email)}
                </span>
                <span className="sr-only">Mon compte</span>
              </button>
              {menuCompte && (
                <div className="compte-menu" role="menu">
                  <div className="compte-entete">
                    <span className={`avatar avatar-grand avatar-${user.role}`} aria-hidden="true">
                      {initiales(user.email)}
                    </span>
                    <div className="compte-identite">
                      <span className="compte-email">{user.email}</span>
                      <span className={`role-badge role-${user.role}`}>
                        {LIBELLE_ROLE[user.role]}
                      </span>
                    </div>
                  </div>
                  <Link href="/" className="compte-lien" role="menuitem">
                    Accueil
                  </Link>
                  {liensCompte.map(([href, libelle]) => (
                    <Link key={href} href={href} className="compte-lien" role="menuitem">
                      {libelle}
                    </Link>
                  ))}
                  <button
                    type="button"
                    className="compte-lien compte-deconnexion"
                    role="menuitem"
                    onClick={() => void seDeconnecter()}
                    disabled={deconnexion}
                  >
                    {deconnexion ? 'Déconnexion…' : 'Se déconnecter'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="topbar-btn topbar-btn-contour">
                Se connecter
              </Link>
              <Link href="/register" className="topbar-btn topbar-btn-plein">
                S’inscrire
              </Link>
            </>
          )}
        </div>
      </div>

      {menuMobile && (
        <div id="menu-mobile" className="menu-mobile">
          {user ? (
            <>
              <form className="topbar-search topbar-search-mobile" role="search" onSubmit={rechercher}>
                <label htmlFor="recherche-catalogue-mobile" className="sr-only">
                  Rechercher une formation
                </label>
                <input
                  id="recherche-catalogue-mobile"
                  type="search"
                  className="topbar-search-input"
                  placeholder="Rechercher une formation…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </form>
              <p className="menu-mobile-titre">Navigation</p>
              <Link href="/" className="menu-mobile-lien">
                Accueil
              </Link>
              {liens.map((lien) => (
                <Link
                  key={lien.href}
                  href={lien.href}
                  className={`menu-mobile-lien${estActif(lien, pathname) ? ' menu-mobile-actif' : ''}`}
                >
                  {lien.libelle}
                </Link>
              ))}
              <p className="menu-mobile-titre">Mon compte</p>
              {liensCompte.map(([href, libelle]) => (
                <Link key={href} href={href} className="menu-mobile-lien">
                  {libelle}
                </Link>
              ))}
              <button
                type="button"
                className="menu-mobile-lien compte-deconnexion"
                onClick={() => void seDeconnecter()}
                disabled={deconnexion}
              >
                {deconnexion ? 'Déconnexion…' : 'Se déconnecter'}
              </button>
            </>
          ) : (
            <>
              <Link href="/" className="menu-mobile-lien">
                Accueil
              </Link>
              <Link href="/login" className="menu-mobile-lien">
                Se connecter
              </Link>
              <Link href="/register" className="menu-mobile-lien">
                Créer un compte
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}

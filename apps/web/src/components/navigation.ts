/**
 * Liens de navigation par rôle (en-tête, menu mobile et pages d'accueil).
 * Purement UI : l'API reste la vraie barrière (@Roles et autorisation par
 * ressource).
 */
export type Role = 'APPRENANT' | 'FORMATEUR' | 'ADMINISTRATEUR';

export interface LienNavigation {
  href: string;
  libelle: string;
  /** Préfixes de chemin qui rendent le lien « actif ». */
  actifSur: string[];
}

export const LIENS_PAR_ROLE: Record<Role, LienNavigation[]> = {
  APPRENANT: [
    { href: '/catalogue', libelle: 'Catalogue', actifSur: ['/catalogue'] },
    {
      href: '/mes-inscriptions',
      libelle: 'Mes formations',
      actifSur: ['/mes-inscriptions', '/mes-ateliers', '/tentatives'],
    },
    { href: '/mes-tentatives', libelle: 'Mes évaluations', actifSur: ['/mes-tentatives'] },
    { href: '/mes-certificats', libelle: 'Mes certificats', actifSur: ['/mes-certificats'] },
  ],
  FORMATEUR: [
    {
      href: '/formateur/formations',
      libelle: 'Mes formations',
      actifSur: ['/formateur/formations', '/formateur/qcm', '/formateur/ateliers', '/formateur/livrables'],
    },
    { href: '/formateur/alertes', libelle: 'Alertes', actifSur: ['/formateur/alertes'] },
    { href: '/rapports', libelle: 'Rapports', actifSur: ['/rapports'] },
    { href: '/catalogue', libelle: 'Catalogue', actifSur: ['/catalogue'] },
  ],
  ADMINISTRATEUR: [
    { href: '/admin/tableau-de-bord', libelle: 'Tableau de bord', actifSur: ['/admin/tableau-de-bord'] },
    {
      href: '/admin/utilisateurs',
      libelle: 'Utilisateurs',
      actifSur: ['/admin/utilisateurs', '/admin/role-requests'],
    },
    { href: '/admin/formations', libelle: 'Formations', actifSur: ['/admin/formations'] },
    { href: '/admin/certificats', libelle: 'Certificats', actifSur: ['/admin/certificats'] },
    { href: '/catalogue', libelle: 'Catalogue', actifSur: ['/catalogue'] },
  ],
};

export const LIBELLE_ROLE: Record<Role, string> = {
  APPRENANT: 'Apprenant',
  FORMATEUR: 'Formateur',
  ADMINISTRATEUR: 'Administrateur',
};

/** Le lien est-il actif pour ce chemin ? */
export function estActif(lien: LienNavigation, chemin: string | null): boolean {
  if (!chemin) return false;
  return lien.actifSur.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/** Initiales affichées dans l'avatar (partie locale de l'email). */
export function initiales(email: string): string {
  const locale = email.split('@')[0] ?? '';
  const morceaux = locale.split(/[._-]+/).filter((m) => m.length > 0);
  const lettres =
    morceaux.length >= 2 ? `${morceaux[0][0]}${morceaux[1][0]}` : locale.slice(0, 2);
  return lettres.toUpperCase() || '?';
}

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

/**
 * US-UI-03 — Menu de chaque rôle : 5 entrées au plus, « Accueil » toujours en
 * tête, même ordre partout (en-tête, menu mobile).
 */
export const LIENS_PAR_ROLE: Record<Role, LienNavigation[]> = {
  APPRENANT: [
    { href: '/mon-espace', libelle: 'Accueil', actifSur: ['/mon-espace'] },
    {
      href: '/mes-inscriptions',
      libelle: 'Mes formations',
      actifSur: ['/mes-inscriptions', '/mes-ateliers', '/tentatives'],
    },
    { href: '/mes-tentatives', libelle: 'Mes évaluations', actifSur: ['/mes-tentatives'] },
    { href: '/mes-certificats', libelle: 'Mes certificats', actifSur: ['/mes-certificats'] },
    { href: '/catalogue', libelle: 'Catalogue', actifSur: ['/catalogue'] },
  ],
  FORMATEUR: [
    { href: '/formateur/tableau-de-bord', libelle: 'Accueil', actifSur: ['/formateur/tableau-de-bord'] },
    {
      href: '/formateur/formations',
      libelle: 'Mes formations',
      actifSur: [
        '/formateur/formations',
        '/formateur/qcm',
        '/formateur/ateliers',
        '/formateur/livrables',
        '/formateur/demandes',
        '/formateur/propositions',
      ],
    },
    { href: '/formateur/alertes', libelle: 'Alertes', actifSur: ['/formateur/alertes'] },
    { href: '/rapports', libelle: 'Rapports', actifSur: ['/rapports'] },
    { href: '/catalogue', libelle: 'Catalogue', actifSur: ['/catalogue'] },
  ],
  ADMINISTRATEUR: [
    { href: '/admin/tableau-de-bord', libelle: 'Accueil', actifSur: ['/admin/tableau-de-bord'] },
    {
      href: '/admin/utilisateurs',
      libelle: 'Utilisateurs',
      actifSur: ['/admin/utilisateurs', '/admin/role-requests'],
    },
    {
      href: '/admin/formations',
      libelle: 'Formations',
      actifSur: ['/admin/formations', '/admin/demandes-affectation', '/admin/propositions-formation'],
    },
    { href: '/admin/certificats', libelle: 'Certificats', actifSur: ['/admin/certificats'] },
    {
      href: '/admin/rapports',
      libelle: 'Pilotage',
      actifSur: ['/admin/rapports', '/admin/risque', '/admin/generations-ia', '/admin/audit'],
    },
  ],
};

/**
 * US-UI-03 — Sous-navigation des sections d'administration : seules les
 * pages de la section courante sont montrées (fin des 11 onglets empilés).
 */
export const SOUS_NAVIGATION_ADMIN: Record<string, Array<[string, string]>> = {
  Utilisateurs: [
    ['/admin/utilisateurs', 'Comptes'],
    ['/admin/role-requests', 'Demandes de rôle'],
  ],
  Formations: [
    ['/admin/formations', 'Formations'],
    ['/admin/demandes-affectation', 'Demandes d’affectation'],
    ['/admin/propositions-formation', 'Propositions'],
  ],
  Pilotage: [
    ['/admin/rapports', 'Rapports'],
    ['/admin/risque', 'Prédiction du risque'],
    ['/admin/generations-ia', 'Générations IA'],
    ['/admin/audit', 'Journal d’audit'],
  ],
};

/** US-UI-03 — Section du menu qui contient ce chemin (lien actif), ou null. */
export function sectionDe(role: Role, chemin: string | null): LienNavigation | null {
  return LIENS_PAR_ROLE[role].find((l) => estActif(l, chemin)) ?? null;
}

/**
 * US-UI-03 — Fil d'Ariane d'un chemin : Accueil › Section › Page (la page
 * vient de la sous-navigation d'administration quand elle existe). Vide sur
 * la page d'accueil du rôle et hors des sections connues.
 */
export function filAriane(role: Role, chemin: string | null): Array<{ href: string; libelle: string }> {
  if (!chemin || chemin === PAGE_ACCUEIL_PAR_ROLE[role]) return [];
  const section = sectionDe(role, chemin);
  if (!section) return [];
  const accueil = { href: PAGE_ACCUEIL_PAR_ROLE[role], libelle: 'Accueil' };
  const miettes = [accueil, { href: section.href, libelle: section.libelle }];
  const page = (SOUS_NAVIGATION_ADMIN[section.libelle] ?? []).find(
    ([href]) => chemin === href || chemin.startsWith(`${href}/`),
  );
  if (page && page[0] !== section.href) miettes.push({ href: page[0], libelle: page[1] });
  return miettes;
}

/**
 * US-NAV-01 — Page d'accueil de chaque rôle : destination après toute
 * connexion, cible du logo et du lien « Accueil », redirection d'un connecté
 * qui ouvre `/` ou une page de visiteur. SEULE source de cette règle côté web ;
 * l'api la reprend à l'identique pour les liens de ses emails
 * (`common/navigation/page-accueil-role.ts`).
 */
export const PAGE_ACCUEIL_PAR_ROLE: Record<Role, string> = {
  ADMINISTRATEUR: '/admin/tableau-de-bord',
  FORMATEUR: '/formateur/tableau-de-bord',
  // US-UI-03 : l'apprenant arrive sur « Mon espace » (ce qu'il a à faire).
  APPRENANT: '/mon-espace',
};

/** Page d'accueil du rôle ; `/` (accueil public) sans rôle connu. */
export function pageAccueilDuRole(role: string | null | undefined): string {
  return role && role in PAGE_ACCUEIL_PAR_ROLE ? PAGE_ACCUEIL_PAR_ROLE[role as Role] : '/';
}

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

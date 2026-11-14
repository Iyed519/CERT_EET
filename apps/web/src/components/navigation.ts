/**
 * Liens de navigation par rôle : en-tête de l'apprenant (et menu mobile),
 * menu latéral groupé du formateur et de l'administrateur (US-UX-02).
 * Module sans import (règles testées par `node --test`).
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
 * US-UI-03 — Menu d'en-tête de chaque rôle (l'apprenant ; pour le formateur et
 * l'administrateur, il ne sert plus qu'au repli — voir NAVIGATION_LATERALE) : 5 entrées au plus, « Accueil » toujours en
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
 * US-QCM-15 — Sous-navigation des sections du formateur : « Alertes » réunit
 * le décrochage (US-SUIVI-02) et la surveillance des QCM par IA.
 */
export const SOUS_NAVIGATION_FORMATEUR: Record<string, Array<[string, string]>> = {
  Alertes: [
    ['/formateur/alertes', 'Décrochage'],
    ['/formateur/alertes/surveillance', 'Surveillance des QCM'],
  ],
};

/** Sous-navigation d'une section, selon le rôle (vide sinon). */
export function sousNavigation(role: Role, section: string): Array<[string, string]> {
  // US-UX-02 : l'administrateur n'a plus de sous-navigation (chaque page a son
  // entrée dans le menu latéral) ; le formateur garde les onglets d'« Alertes ».
  const table: Record<string, Array<[string, string]>> = role === 'FORMATEUR' ? SOUS_NAVIGATION_FORMATEUR : {};
  return table[section] ?? [];
}

/** Onglet actif d'une sous-navigation : le plus précis qui contient le chemin. */
export function ongletActif(
  onglets: Array<[string, string]>,
  chemin: string | null,
): [string, string] | null {
  if (!chemin) return null;
  return (
    onglets
      .filter(([href]) => chemin === href || chemin.startsWith(`${href}/`))
      .sort((x, y) => y[0].length - x[0].length)[0] ?? null
  );
}

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
  // US-UX-02 : formateur et administrateur suivent le menu latéral.
  const groupes = NAVIGATION_LATERALE[role];
  const section = groupes ? entreeActive(groupes, chemin) : sectionDe(role, chemin);
  if (!section || section.href === PAGE_ACCUEIL_PAR_ROLE[role]) return [];
  const accueil = { href: PAGE_ACCUEIL_PAR_ROLE[role], libelle: 'Accueil' };
  const miettes = [accueil, { href: section.href, libelle: section.libelle }];
  const page = ongletActif(sousNavigation(role, section.libelle), chemin);
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

// ---------------------------------------------------------------------------
// US-UX-02 — Menu latéral groupé du formateur et de l'administrateur.
// ---------------------------------------------------------------------------

/** Compteurs renvoyés par GET /api/navigation/compteurs. */
export type CleCompteur =
  | 'alertes'
  | 'livrablesACorriger'
  | 'tentativesAEvaluer'
  | 'demandesRole'
  | 'demandesAffectation'
  | 'propositions';

export interface EntreeLaterale {
  href: string;
  libelle: string;
  /** Nom d'icône du composant `Icone`. */
  icone: string;
  /**
   * Chemins qui rendent l'entrée active : segments fixes, `:id` (un segment
   * quelconque), `*` en dernier (la suite, ou rien). Le motif le plus précis gagne.
   */
  motifs: string[];
  compteur?: CleCompteur;
}

export interface GroupeLateral {
  /** Titre du groupe ; null pour l'entrée « Accueil » en tête. */
  titre: string | null;
  entrees: EntreeLaterale[];
}

export const NAVIGATION_LATERALE: Partial<Record<Role, GroupeLateral[]>> = {
  FORMATEUR: [
    {
      titre: null,
      entrees: [
        { href: '/formateur/tableau-de-bord', libelle: 'Accueil', icone: 'accueil', motifs: ['/formateur/tableau-de-bord'] },
      ],
    },
    {
      titre: 'Enseigner',
      entrees: [
        {
          href: '/formateur/formations',
          libelle: 'Mes formations',
          icone: 'formation',
          motifs: ['/formateur/formations/*', '/formateur/qcm/:id', '/formateur/ateliers/*'],
        },
        { href: '/formateur/demandes', libelle: 'Demander une formation', icone: 'demande', motifs: ['/formateur/demandes/*'] },
        {
          href: '/formateur/propositions',
          libelle: 'Proposer une formation',
          icone: 'proposition',
          motifs: ['/formateur/propositions/*'],
        },
      ],
    },
    {
      titre: 'Évaluer',
      entrees: [
        {
          href: '/formateur/livrables',
          libelle: 'Livrables à corriger',
          icone: 'livrable',
          motifs: ['/formateur/livrables/*'],
          compteur: 'livrablesACorriger',
        },
        {
          href: '/formateur/qcm',
          libelle: 'Tentatives des QCM',
          icone: 'qcm',
          motifs: ['/formateur/qcm', '/formateur/qcm/:id/tentatives/*'],
          compteur: 'tentativesAEvaluer',
        },
      ],
    },
    {
      titre: 'Suivre',
      entrees: [
        {
          href: '/formateur/apprenants',
          libelle: 'Apprenants',
          icone: 'apprenants',
          motifs: ['/formateur/apprenants/*', '/formateur/formations/:id/suivi/*'],
        },
        { href: '/formateur/alertes', libelle: 'Alertes', icone: 'alerte', motifs: ['/formateur/alertes/*'], compteur: 'alertes' },
        { href: '/rapports', libelle: 'Rapports', icone: 'rapport', motifs: ['/rapports/*', '/formateur/formations/:id/rapports/*'] },
      ],
    },
    {
      titre: 'Explorer',
      entrees: [{ href: '/catalogue', libelle: 'Catalogue', icone: 'catalogue', motifs: ['/catalogue/*'] }],
    },
  ],
  ADMINISTRATEUR: [
    {
      titre: null,
      entrees: [{ href: '/admin/tableau-de-bord', libelle: 'Accueil', icone: 'accueil', motifs: ['/admin/tableau-de-bord'] }],
    },
    {
      titre: 'Personnes',
      entrees: [
        { href: '/admin/utilisateurs', libelle: 'Comptes', icone: 'utilisateurs', motifs: ['/admin/utilisateurs/*'] },
        {
          href: '/admin/role-requests',
          libelle: 'Demandes de rôle',
          icone: 'role',
          motifs: ['/admin/role-requests/*'],
          compteur: 'demandesRole',
        },
      ],
    },
    {
      titre: 'Formations',
      entrees: [
        { href: '/admin/formations', libelle: 'Formations', icone: 'formation', motifs: ['/admin/formations/*'] },
        {
          href: '/admin/demandes-affectation',
          libelle: 'Demandes d’affectation',
          icone: 'demande',
          motifs: ['/admin/demandes-affectation/*'],
          compteur: 'demandesAffectation',
        },
        {
          href: '/admin/propositions-formation',
          libelle: 'Propositions',
          icone: 'proposition',
          motifs: ['/admin/propositions-formation/*'],
          compteur: 'propositions',
        },
      ],
    },
    {
      titre: 'Certificats',
      entrees: [{ href: '/admin/certificats', libelle: 'Certificats', icone: 'certificat', motifs: ['/admin/certificats/*'] }],
    },
    {
      titre: 'Pilotage',
      entrees: [
        { href: '/admin/rapports', libelle: 'Rapports', icone: 'rapport', motifs: ['/admin/rapports/*'] },
        { href: '/admin/risque', libelle: 'Prédiction du risque', icone: 'risque', motifs: ['/admin/risque/*'] },
        { href: '/admin/generations-ia', libelle: 'Générations IA', icone: 'ia', motifs: ['/admin/generations-ia/*'] },
      ],
    },
    {
      titre: 'Sécurité',
      entrees: [{ href: '/admin/audit', libelle: 'Journal d’audit', icone: 'audit', motifs: ['/admin/audit/*'] }],
    },
  ],
};

/** Le rôle a-t-il le menu latéral ? */
export function aNavigationLaterale(role: string | null | undefined): boolean {
  return !!role && role in NAVIGATION_LATERALE;
}

/**
 * Précision d'un motif pour un chemin, ou -1 s'il ne correspond pas : un
 * segment fixe vaut 10, un `:id` 5, et un motif sans `*` gagne 1 de plus.
 */
export function precisionMotif(motif: string, chemin: string): number {
  const segs = (x: string): string[] => x.split('?')[0].split('/').filter((s) => s.length > 0);
  const m = segs(motif);
  const c = segs(chemin);
  const joker = m[m.length - 1] === '*';
  const fixes = joker ? m.slice(0, -1) : m;
  if (joker ? c.length < fixes.length : c.length !== fixes.length) return -1;
  let score = 0;
  for (let i = 0; i < fixes.length; i++) {
    if (fixes[i].startsWith(':')) score += 5;
    else if (fixes[i] === c[i]) score += 10;
    else return -1;
  }
  return joker ? score : score + 1;
}

/** Entrée active d'un chemin : celle dont un motif est le plus précis ; null si aucune. */
export function entreeActive(groupes: GroupeLateral[], chemin: string | null): EntreeLaterale | null {
  if (!chemin) return null;
  let meilleure: EntreeLaterale | null = null;
  let score = -1;
  for (const g of groupes) {
    for (const e of g.entrees) {
      for (const m of e.motifs) {
        const p = precisionMotif(m, chemin);
        if (p > score) {
          score = p;
          meilleure = e;
        }
      }
    }
  }
  return meilleure;
}

/** Texte d'un compteur du menu : rien à zéro ou absent, plafonné à « 99+ ». */
export function texteCompteurMenu(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}

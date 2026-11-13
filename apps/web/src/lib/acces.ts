import { pageAccueilDuRole } from '../components/navigation';

/**
 * US-NAV-01 — Règles de navigation selon la session (purement UI : l'api
 * reste la vraie barrière, @Roles et autorisation par ressource). Fonctions
 * pures, sans React : une seule décision pour toutes les pages.
 */

/** Pages de visiteur : un connecté qui les ouvre part vers sa page de rôle. */
export const PAGES_VISITEUR = [
  '/login',
  '/register',
  '/mot-de-passe-oublie',
  '/reinitialiser-mot-de-passe',
  '/activer-compte',
];

/**
 * Pages réservées à une session, avec les rôles admis (null : tout connecté).
 * Le premier préfixe qui correspond s'applique.
 */
export const PAGES_PROTEGEES: Array<{ prefixe: string; roles: string[] | null }> = [
  { prefixe: '/admin', roles: ['ADMINISTRATEUR'] },
  { prefixe: '/formateur', roles: ['FORMATEUR', 'ADMINISTRATEUR'] },
  { prefixe: '/rapports', roles: ['FORMATEUR', 'ADMINISTRATEUR'] },
  { prefixe: '/mon-espace', roles: ['APPRENANT'] },
  { prefixe: '/catalogue', roles: null },
  { prefixe: '/mes-inscriptions', roles: null },
  { prefixe: '/mes-ateliers', roles: null },
  { prefixe: '/mes-tentatives', roles: null },
  { prefixe: '/mes-certificats', roles: null },
  { prefixe: '/tentatives', roles: null },
  { prefixe: '/mon-role', roles: null },
  { prefixe: '/securite', roles: null },
];

/** Paramètre d'URL qui porte la page demandée avant la connexion. */
export const PARAMETRE_SUITE = 'suite';

/** La page demandée survit à l'aller-retour OAuth (sessionStorage ; aucun jeton). */
export const CLE_SUITE_OAUTH = 'cert-eet-suite';

function correspond(chemin: string, prefixe: string): boolean {
  return chemin === prefixe || chemin.startsWith(`${prefixe}/`);
}

export function estPageVisiteur(chemin: string): boolean {
  return PAGES_VISITEUR.some((p) => correspond(chemin, p));
}

export function regleProtection(chemin: string): { prefixe: string; roles: string[] | null } | null {
  return PAGES_PROTEGEES.find((r) => correspond(chemin, r.prefixe)) ?? null;
}

/**
 * Chemin de retour sûr, ou null. Seuls les chemins INTERNES sont admis : un
 * seul « / » en tête (ni « // » ni « /\\ », qui désignent un autre site), pas
 * de caractère de contrôle, longueur raisonnable. Jamais une page de visiteur
 * (on en repartirait aussitôt).
 */
export function suiteSure(brut: string | null | undefined): string | null {
  if (typeof brut !== 'string' || brut.length === 0 || brut.length > 2048) return null;
  if (brut[0] !== '/' || brut[1] === '/' || brut[1] === '\\') return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(brut)) return null;
  const chemin = brut.split(/[?#]/)[0];
  if (estPageVisiteur(chemin)) return null;
  return brut;
}

/** Le rôle peut-il ouvrir ce chemin ? (pages non protégées : oui) */
export function roleAdmis(chemin: string, role: string): boolean {
  const regle = regleProtection(chemin);
  return regle === null || regle.roles === null || regle.roles.includes(role);
}

/** Destination après une connexion : la suite demandée si sûre et admise, sinon la page du rôle. */
export function destinationApresConnexion(role: string, suite: string | null | undefined): string {
  const sure = suiteSure(suite);
  if (sure && roleAdmis(sure.split(/[?#]/)[0], role)) return sure;
  return pageAccueilDuRole(role);
}

/** Page de connexion qui ramènera ensuite sur `cheminComplet`. */
export function lienConnexion(cheminComplet: string): string {
  const sure = suiteSure(cheminComplet);
  return sure && sure !== '/' ? `/login?${PARAMETRE_SUITE}=${encodeURIComponent(sure)}` : '/login';
}

export type Decision = { type: 'afficher' } | { type: 'rediriger'; vers: string };

/**
 * Décision pour une page, une fois la session restaurée (US-AUTH-17).
 *  - connecté sur `/` ou une page de visiteur -> sa destination (suite ou page du rôle) ;
 *  - connecté sur une page d'un autre rôle -> sa page de rôle ;
 *  - visiteur sur une page protégée -> connexion, avec retour sur cette page.
 */
export function decisionNavigation(
  chemin: string,
  recherche: string,
  role: string | null,
): Decision {
  if (role) {
    if (chemin === '/' || estPageVisiteur(chemin)) {
      const suite = new URLSearchParams(recherche).get(PARAMETRE_SUITE);
      return { type: 'rediriger', vers: destinationApresConnexion(role, suite) };
    }
    if (!roleAdmis(chemin, role)) return { type: 'rediriger', vers: pageAccueilDuRole(role) };
    return { type: 'afficher' };
  }
  if (regleProtection(chemin)) {
    return { type: 'rediriger', vers: lienConnexion(`${chemin}${recherche}`) };
  }
  return { type: 'afficher' };
}

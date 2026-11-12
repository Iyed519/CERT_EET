import { lienConnexion } from './acces';

/**
 * Client API du frontend (US-AUTH-01, US-AUTH-03, US-AUTH-04).
 *
 * Centralise les appels HTTP vers le backend NestJS. Chemins relatifs
 * ("/api/...") : frontend et API partagent le même reverse proxy Nginx (INF03),
 * donc pas de CORS ni d'URL de base à configurer.
 */
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: 'APPRENANT' | 'FORMATEUR' | 'ADMINISTRATEUR';
  };
}

export class LoginError extends Error {}

/** US-AUTH-02 — Défi MFA renvoyé par /api/auth/login quand la MFA est active. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

/** Type-guard : distingue un défi MFA d'une session complète. */
export function isMfaChallenge(
  res: LoginResponse | MfaChallenge,
): res is MfaChallenge {
  return 'mfaRequired' in res;
}

/**
 * POST /api/auth/login. credentials:'include' pour que le navigateur accepte
 * le cookie httpOnly (refresh token). Échec -> LoginError avec le message
 * générique du backend (opacité, DS-01).
 */
export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse | MfaChallenge> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new LoginError(
      data.message ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return data as LoginResponse | MfaChallenge;
}

/**
 * US-AUTH-02 — Seconde étape de connexion. POST /api/auth/mfa/verify avec le
 * mfaToken temporaire + le code TOTP. credentials:'include' pour recevoir le
 * cookie refresh httpOnly. Échec -> LoginError (message générique du backend).
 */
export async function mfaVerifyRequest(
  mfaToken: string,
  code: string,
): Promise<LoginResponse> {
  const response = await fetch('/api/auth/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mfaToken, code }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new LoginError(message ?? 'Code de vérification invalide ou expiré.');
  }
  return data as LoginResponse;
}

/* ============================================================
 * US-AUTH-03 / US-AUTH-04 — Access token en mémoire + intercepteur 401 + logout
 * ============================================================ */

/**
 * Access token courant, en variable de MODULE (miroir de l'état React
 * d'AuthContext) : apiFetch n'est pas un hook et doit lire le token hors rendu.
 */
let currentAccessToken: string | null = null;

/** Handlers fournis par AuthContext pour resynchroniser l'état React. */
let onRefreshed: ((session: LoginResponse) => void) | null = null;
let onCleared: (() => void) | null = null;

/** Promesse de refresh partagée (single-flight). */
let refreshInFlight: Promise<LoginResponse | null> | null = null;

/**
 * US-AUTH-17 — Restauration de la session au chargement de la page : UNE seule
 * par chargement (le module est réévalué à chaque rechargement complet), même
 * si plusieurs composants la demandent ou si React rejoue les effets.
 */
let restaurationInitiale: Promise<LoginResponse | null> | null = null;

/** Au-delà, la restauration est abandonnée (api injoignable) : visiteur anonyme. */
const DELAI_RESTAURATION_MS = 8000;

/** Met à jour le miroir du token (appelé par AuthContext.setSession). */
export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/** AuthContext s'enregistre ici pour rester synchronisé avec apiFetch. */
export function registerSessionHandlers(handlers: {
  onRefreshed: (session: LoginResponse) => void;
  onCleared: () => void;
}): void {
  onRefreshed = handlers.onRefreshed;
  onCleared = handlers.onCleared;
}

/**
 * fetch authentifié : attache l'access token courant + envoie les cookies.
 */
async function fetchWithAuth(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

/**
 * US-AUTH-03 — Point d'entrée de TOUT appel authentifié.
 *   1. envoie avec l'access token courant ;
 *   2. si 401, tente UN refresh silencieux ;
 *   3a. OK -> rejoue la requête ; 3b. KO -> nettoie + /login.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetchWithAuth(input, init);
  if (response.status !== 401) {
    return response;
  }

  const session = await refreshSession();
  if (!session) {
    forceLogout();
    return response;
  }

  return fetchWithAuth(input, init);
}

/** Refresh single-flight : un seul appel réseau partagé. */
function refreshSession(): Promise<LoginResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * US-AUTH-17 — Sérialise les rafraîchissements ENTRE ONGLETS du même
 * navigateur (Web Locks) : deux onglets rechargés ensemble enverraient le même
 * cookie, et la rotation n'en accepte qu'un (l'autre recevrait 401). Avec le
 * verrou, le second attend et part avec le cookie déjà pivoté. Sans l'API
 * (contexte non sécurisé, vieux navigateur) : appel direct, comme avant.
 */
async function avecVerrouRafraichissement<T>(appel: () => Promise<T>): Promise<T> {
  const verrous =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  if (!verrous) return appel();
  return verrous.request('cert-eet-rafraichissement-session', appel);
}

/** POST /api/auth/refresh (le cookie part tout seul). */
async function doRefresh(): Promise<LoginResponse | null> {
  const response = await avecVerrouRafraichissement(() =>
    fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    }),
  );
  if (!response.ok) {
    return null;
  }
  const session = (await response.json()) as LoginResponse;
  currentAccessToken = session.accessToken;
  if (onRefreshed) {
    onRefreshed(session);
  }
  return session;
}

/**
 * US-AUTH-17 — Restauration de la session au chargement de la page, appelée
 * une fois par AuthProvider : même refresh partagé qu'apiFetch (jamais deux
 * appels concurrents, donc jamais deux rotations du même jeton). Un échec ne
 * redirige PAS vers /login : un visiteur anonyme reste sur la page. Renvoie
 * la session restaurée, ou null (pas de cookie, cookie refusé, api muette).
 */
export function restaurerSessionInitiale(): Promise<LoginResponse | null> {
  if (!restaurationInitiale) {
    const delai = new Promise<null>((resoudre) => {
      setTimeout(() => resoudre(null), DELAI_RESTAURATION_MS);
    });
    restaurationInitiale = Promise.race([
      refreshSession().catch(() => null),
      delai,
    ]);
  }
  return restaurationInitiale;
}

/**
 * Session morte : on efface tout et on renvoie vers /login. US-NAV-01 : une
 * session expirée en cours de route ramène, après reconnexion, sur la page
 * où l'on était (`?suite=`) ; une déconnexion volontaire, non.
 */
function forceLogout(revenirIci = true): void {
  currentAccessToken = null;
  if (onCleared) {
    onCleared();
  }
  if (typeof window !== 'undefined') {
    window.location.href = revenirIci
      ? lienConnexion(`${window.location.pathname}${window.location.search}`)
      : '/login';
  }
}

/**
 * US-AUTH-04 — Déconnexion volontaire.
 *
 * Appelle POST /api/auth/logout en envoyant l'access token courant (pour que
 * le serveur le blackliste) ET le cookie de refresh (envoyé automatiquement).
 * Quoi qu'il arrive côté réseau, on nettoie la session locale et on redirige :
 * une déconnexion ne doit jamais "échouer" pour l'utilisateur (d'où le finally).
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: currentAccessToken
        ? { Authorization: `Bearer ${currentAccessToken}` }
        : {},
    });
  } finally {
    forceLogout(false);
  }
}

/* ============================================================
 * US-CPT-05 — Auto-inscription publique + vérification d'email
 * ============================================================ */
export class RegisterError extends Error {}
export interface RegisterInput {
  nom: string;
  prenom: string;
  email: string;
  password: string;
}
/**
 * POST /api/auth/register. Aucun cookie/token en retour (le compte doit
 * d'abord être vérifié) : on renvoie juste le message de confirmation.
 * data.message peut être une chaîne (409) ou un tableau (erreurs de validation).
 */
export async function registerRequest(
  input: RegisterInput,
): Promise<{ message: string }> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new RegisterError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return data as { message: string };
}
export class VerifyEmailError extends Error {}
/**
 * POST /api/auth/verify-email. Active le compte si le jeton est valide.
 */
export async function verifyEmailRequest(
  token: string,
): Promise<{ message: string }> {
  const response = await fetch('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new VerifyEmailError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return data as { message: string };
}

/**
 * US-AUTH-14 — Bootstrap de session après une connexion OAuth. Le callback
 * backend a posé le cookie refresh (httpOnly) puis redirigé : c'est un
 * chargement complet, AuthProvider restaure déjà la session. US-AUTH-17 : on
 * attend CETTE restauration au lieu d'un second POST /refresh concurrent (le
 * même cookie présenté deux fois : un seul gagne, l'autre recevait 401 et
 * renvoyait à tort vers /login). Retourne la session ou null.
 */
export async function bootstrapSession(): Promise<LoginResponse | null> {
  return restaurerSessionInitiale();
}

/* ============================================================
 * US-AUTH-15 — Profil apprenant (carte de complétion) + référentiel
 * ============================================================ */
export type NiveauEtudes =
  | 'SANS_BAC'
  | 'BAC'
  | 'PREPA'
  | 'BTS'
  | 'LICENCE'
  | 'MAITRISE'
  | 'MASTERE'
  | 'INGENIEUR'
  | 'DOCTORAT'
  | 'AUTRE';
export interface ProfilResponse {
  id: string;
  email: string;
  role: string;
  profilComplet: boolean;
  mfaActive: boolean;
  dateNaissance: string | null;
  age: number | null;
  niveauEtudes: NiveauEtudes | null;
  domaineEtudesId: string | null;
  etablissementId: string | null;
  etablissementAutre: string | null;
}
export interface Domaine {
  id: string;
  code: string;
  libelle: string;
}
export interface EtablissementVue {
  id: string;
  nom: string;
  type: string;
  gouvernorat: string | null;
  universite: { id: string; nom: string; type: string } | null;
}
export interface CompleteProfileInput {
  dateNaissance: string;
  niveauEtudes: NiveauEtudes;
  enEtudes: boolean;
  domaineEtudesId?: string;
  etablissementId?: string;
  etablissementAutre?: string;
}
export class ProfilError extends Error {}
/** GET /api/auth/me — profil courant (incl. profil_complet). */
export async function getMe(): Promise<ProfilResponse> {
  const response = await apiFetch('/api/auth/me');
  if (!response.ok) {
    throw new ProfilError('Impossible de charger le profil.');
  }
  return (await response.json()) as ProfilResponse;
}
/** GET /api/referentiel/domaines. */
export async function getDomaines(): Promise<Domaine[]> {
  const response = await apiFetch('/api/referentiel/domaines');
  if (!response.ok) {
    throw new ProfilError('Impossible de charger les domaines.');
  }
  return (await response.json()) as Domaine[];
}
/** GET /api/referentiel/etablissements. */
export async function getEtablissements(): Promise<EtablissementVue[]> {
  const response = await apiFetch('/api/referentiel/etablissements');
  if (!response.ok) {
    throw new ProfilError('Impossible de charger les établissements.');
  }
  return (await response.json()) as EtablissementVue[];
}
/** PATCH /api/auth/profile — complète le profil apprenant. */
export async function completeProfile(
  input: CompleteProfileInput,
): Promise<ProfilResponse> {
  const response = await apiFetch('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new ProfilError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return data as ProfilResponse;
}

/* ============================================================
 * US-ROL-01 — Administration des utilisateurs (rôles)
 * ============================================================ */

export type RoleUtilisateur = 'APPRENANT' | 'FORMATEUR' | 'ADMINISTRATEUR';

/** Vue d'un utilisateur renvoyée par GET /api/admin/users (jamais le hash). */
export interface AdminUser {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  role: RoleUtilisateur;
  statut: string;
}

/** Erreur d'administration : porte le code HTTP pour distinguer 401/403/404. */
export class AdminError extends Error {
  constructor(
    message: string,
    public readonly statut?: number,
  ) {
    super(message);
  }
}

/**
 * GET /api/admin/users — liste des comptes (réservé ADMINISTRATEUR côté API).
 * Passe par apiFetch : l'access token est attaché et un 401 déclenche le
 * refresh silencieux. Un 403 signifie « pas admin » (RolesGuard, US-AUTH-11).
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) {
    throw new AdminError(
      response.status === 403
        ? 'Accès réservé aux administrateurs.'
        : 'Impossible de charger les utilisateurs.',
      response.status,
    );
  }
  return (await response.json()) as AdminUser[];
}

/**
 * PATCH /api/admin/users/:id/role — change le rôle d'un utilisateur.
 * Le mot de passe de l'admin est exigé par le backend (step-up, US-ROL-01) :
 *   - 401 -> mot de passe admin invalide ;
 *   - 403 -> rétrogradation du dernier admin actif refusée ;
 *   - 400 -> rôle déjà appliqué / données invalides ;
 *   - 404 -> cible introuvable.
 * On remonte le message exact du backend dans AdminError.
 */
export async function changeUserRole(
  userId: string,
  nouveauRole: RoleUtilisateur,
  motDePasseAdmin: string,
): Promise<AdminUser> {
  const response = await apiFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nouveauRole, motDePasseAdmin }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new AdminError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
    );
  }
  return data as AdminUser;
}

/* ============================================================
 * US-CPT-03 — Administration des utilisateurs (statut : désactiver / réactiver)
 * ============================================================ */

/** Statuts qu'un administrateur peut poser depuis la console (US-CPT-03). */
export type StatutAdministrable = 'ACTIF' | 'DESACTIVE';

/**
 * PATCH /api/admin/users/:id — (dés)active un compte.
 * Corps `{ statut, motif? }` : le motif n'est envoyé qu'à la désactivation
 * (obligatoire côté backend). Aucun mot de passe admin ici (pas de step-up,
 * différence avec le changement de rôle) :
 *   - 400 -> motif manquant / statut déjà appliqué ;
 *   - 403 -> désactivation du dernier admin actif refusée ;
 *   - 404 -> cible introuvable.
 * On remonte le message exact du backend dans AdminError.
 */
export async function changeUserStatut(
  userId: string,
  statut: StatutAdministrable,
  motif?: string,
): Promise<AdminUser> {
  const body = statut === 'DESACTIVE' ? { statut, motif } : { statut };
  const response = await apiFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new AdminError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
    );
  }
  return data as AdminUser;
}

/* ============================================================
 * US-AUTH-12 — Journal d'audit (consultation + export CSV)
 * ============================================================ */

/** US-AUDIT-01 — Acteur joint (liste blanche) ; null si compte absent / anonyme. */
export interface AuditActeur {
  id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
  role: string;
}

/** Une entrée du journal telle que renvoyée par l'API (lecture seule). */
export interface AuditLogEntry {
  id: string;
  userId: string | null; // acteur
  acteur: AuditActeur | null;
  action: string;
  cible: string | null;
  adresseIp: string | null;
  resultat: string | null; // "Succès" | "Échec"
  detailsAvantApres: Record<string, unknown> | null;
  horodatage: string;
}

/** Réponse paginée de GET /api/admin/audit-logs. */
export interface AuditPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

/** Filtres de consultation / export (from & to en date AAAA-MM-JJ). */
export interface AuditQuery {
  action?: string;
  userId?: string;
  /** US-AUDIT-01 : email de l'acteur (contient, sans casse). */
  acteur?: string;
  /** US-AUDIT-01 : ressource visée (exacte). */
  cible?: string;
  /** US-AUDIT-01 : « Succès » ou « Échec ». */
  resultat?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * Construit la query string. Les dates (AAAA-MM-JJ) sont converties en bornes
 * ISO couvrant le jour entier en UTC : `from` au début du jour, `to` à la fin,
 * pour que la borne haute inclue toute la journée saisie.
 */
function buildAuditParams(query: AuditQuery): string {
  const params = new URLSearchParams();
  if (query.action) params.set('action', query.action);
  if (query.userId) params.set('userId', query.userId);
  if (query.acteur) params.set('acteur', query.acteur);
  if (query.cible) params.set('cible', query.cible);
  if (query.resultat) params.set('resultat', query.resultat);
  if (query.from) params.set('from', `${query.from}T00:00:00.000Z`);
  if (query.to) params.set('to', `${query.to}T23:59:59.999Z`);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * GET /api/admin/audit-logs — journal paginé (ADMINISTRATEUR). Passe par
 * apiFetch (token attaché, refresh silencieux sur 401). Un 403 = « pas admin ».
 */
export async function getAuditLogs(query: AuditQuery = {}): Promise<AuditPage> {
  const response = await apiFetch(
    `/api/admin/audit-logs${buildAuditParams(query)}`,
  );
  if (!response.ok) {
    throw new AdminError(
      await messageErreurAudit(
        response,
        "Impossible de charger le journal d'audit.",
      ),
      response.status,
    );
  }
  return (await response.json()) as AuditPage;
}

/**
 * US-AUDIT-01 — Message d'erreur : 403 = pas admin ; 400 = message de l'API
 * (ex. période inversée) ; sinon message générique.
 */
async function messageErreurAudit(
  response: Response,
  generique: string,
): Promise<string> {
  if (response.status === 403) return 'Accès réservé aux administrateurs.';
  if (response.status === 400) {
    try {
      const corps = (await response.json()) as { message?: string | string[] };
      const message = Array.isArray(corps.message)
        ? corps.message.join(' ')
        : corps.message;
      if (message) return message;
    } catch {
      // corps illisible : message générique
    }
  }
  return generique;
}

/**
 * US-AUDIT-01 — GET /api/admin/audit-logs/actions : types d'action présents
 * dans le journal (liste déroulante du filtre « Action »).
 */
export async function getAuditActions(): Promise<string[]> {
  const response = await apiFetch('/api/admin/audit-logs/actions');
  if (!response.ok) {
    throw new AdminError(
      await messageErreurAudit(
        response,
        "Impossible de charger les types d'action.",
      ),
      response.status,
    );
  }
  return (await response.json()) as string[];
}

/**
 * GET /api/admin/audit-logs/export — télécharge le CSV filtré (MÊMES filtres que
 * la consultation, sans pagination : on exporte tout le résultat). On récupère
 * le blob puis on déclenche un téléchargement navigateur ; le nom de fichier
 * vient de l'en-tête Content-Disposition.
 */
export async function downloadAuditLogsCsv(
  query: AuditQuery = {},
): Promise<void> {
  const response = await apiFetch(
    `/api/admin/audit-logs/export${buildAuditParams(query)}`,
  );
  if (!response.ok) {
    throw new AdminError(
      await messageErreurAudit(
        response,
        "Impossible d'exporter le journal d'audit.",
      ),
      response.status,
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const correspondance = /filename="?([^";]+)"?/.exec(disposition);
  const nomFichier = correspondance?.[1] ?? 'audit-logs.csv';
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
 * US-ROL-02 — Demandes de changement de rôle (self-service + traitement admin)
 * ============================================================ */

/** Rôle qu'un utilisateur peut DEMANDER (montée en privilège uniquement). */
export type RoleDemande = 'FORMATEUR' | 'ADMINISTRATEUR';

/** Cycle de vie d'une demande. */
export type StatutDemande = 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE';

/** Vue d'une demande côté AUTEUR (GET /api/role-requests/me). */
export interface DemandeRoleVue {
  id: string;
  roleDemande: RoleDemande;
  justification: string;
  statut: StatutDemande;
  motif: string | null;
  traiteAt: string | null;
  createdAt: string;
}

/** Vue ADMIN d'une demande (enrichie du demandeur + traçabilité). */
export interface DemandeRoleAdminVue extends DemandeRoleVue {
  traitePar: string | null;
  demandeur: {
    id: string;
    email: string;
    nom: string | null;
    prenom: string | null;
  };
}

/** Réponse paginée de GET /api/admin/role-requests. */
export interface DemandeRolePage {
  items: DemandeRoleAdminVue[];
  total: number;
  page: number;
  limit: number;
}

/**
 * POST /api/role-requests — soumettre une demande (tout utilisateur connecté).
 *   - 400 -> rôle déjà détenu / justification invalide ;
 *   - 409 -> une demande est déjà en attente.
 * On remonte le message exact du backend dans AdminError.
 */
export async function createRoleRequest(
  roleDemande: RoleDemande,
  justification: string,
): Promise<DemandeRoleVue> {
  const response = await apiFetch('/api/role-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleDemande, justification }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new AdminError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
    );
  }
  return data as DemandeRoleVue;
}

/** GET /api/role-requests/me — mes demandes, la plus récente d'abord. */
export async function getMesDemandesRole(): Promise<DemandeRoleVue[]> {
  const response = await apiFetch('/api/role-requests/me');
  if (!response.ok) {
    throw new AdminError('Impossible de charger vos demandes.', response.status);
  }
  return (await response.json()) as DemandeRoleVue[];
}

/**
 * GET /api/admin/role-requests — file des demandes (ADMINISTRATEUR).
 * Filtre `statut` optionnel + pagination. Un 403 = « pas admin ».
 */
export async function getAdminRoleRequests(query: {
  statut?: StatutDemande;
  page?: number;
  limit?: number;
} = {}): Promise<DemandeRolePage> {
  const params = new URLSearchParams();
  if (query.statut) params.set('statut', query.statut);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  const response = await apiFetch(
    `/api/admin/role-requests${qs ? `?${qs}` : ''}`,
  );
  if (!response.ok) {
    throw new AdminError(
      response.status === 403
        ? 'Accès réservé aux administrateurs.'
        : 'Impossible de charger les demandes de rôle.',
      response.status,
    );
  }
  return (await response.json()) as DemandeRolePage;
}

/**
 * PATCH /api/admin/role-requests/:id/approve — applique le changement de rôle.
 *   - 404 -> demande introuvable ; 409 -> déjà traitée.
 */
export async function approveRoleRequest(
  id: string,
): Promise<DemandeRoleAdminVue> {
  const response = await apiFetch(`/api/admin/role-requests/${id}/approve`, {
    method: 'PATCH',
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new AdminError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
    );
  }
  return data as DemandeRoleAdminVue;
}

/**
 * PATCH /api/admin/role-requests/:id/reject — rejette avec motif (obligatoire).
 *   - 400 -> motif manquant ; 404 -> introuvable ; 409 -> déjà traitée.
 */
export async function rejectRoleRequest(
  id: string,
  motif: string,
): Promise<DemandeRoleAdminVue> {
  const response = await apiFetch(`/api/admin/role-requests/${id}/reject`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motif }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message;
    throw new AdminError(
      message ?? 'Une erreur est survenue. Veuillez réessayer.',
      response.status,
    );
  }
  return data as DemandeRoleAdminVue;
}

/* ============================================================
 * US-AUTH-09 — Réglages MFA (activation / désactivation, self-service)
 * ============================================================ */
export class MfaError extends Error {}
export interface MfaSetupResponse {
  otpauthUrl: string;
  qrDataUrl: string;
}
/** Petit utilitaire : message d'erreur backend (chaîne ou tableau de validation). */
function messageErreur(data: { message?: string | string[] }): string | undefined {
  return Array.isArray(data.message) ? data.message.join(' ') : data.message;
}
/** POST /api/auth/mfa/setup — secret en attente + QR (data URL). 409 si déjà active. */
export async function mfaSetup(): Promise<MfaSetupResponse> {
  const response = await apiFetch('/api/auth/mfa/setup', { method: 'POST' });
  const data = await response.json();
  if (!response.ok) {
    throw new MfaError(
      messageErreur(data) ?? "Impossible de démarrer l'activation MFA.",
    );
  }
  return data as MfaSetupResponse;
}
/** POST /api/auth/mfa/enable — confirme l'activation avec un code TOTP. */
export async function mfaEnable(code: string): Promise<{ message: string }> {
  const response = await apiFetch('/api/auth/mfa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new MfaError(messageErreur(data) ?? 'Code invalide.');
  }
  return data as { message: string };
}
/** POST /api/auth/mfa/disable — désactive la MFA avec un code TOTP. */
export async function mfaDisable(code: string): Promise<{ message: string }> {
  const response = await apiFetch('/api/auth/mfa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new MfaError(messageErreur(data) ?? 'Code invalide.');
  }
  return data as { message: string };
}

/* ============================================================
 * US-FORM-01 — Formations (création, configuration, modules)
 * ============================================================ */

/** Cycle de vie d'une formation (l'enum backend reste la source de vérité). */
/** US-FORM-08 : BROUILLON = proposition acceptée, pas encore publiée. */
export type StatutFormation = 'BROUILLON' | 'OUVERTE' | 'FERMEE' | 'ARCHIVEE';

/** Vue d'une formation (liste, création, modification). Dates en AAAA-MM-JJ. */
export interface FormationVue {
  id: string;
  titre: string;
  description: string | null;
  objectifs: string | null;
  prerequis: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  dureeHeures: number | null;
  capaciteMax: number;
  statut: StatutFormation;
  noteMinCertification: number;
  modeleCertificat: string | null;
  /** US-CERT-07 — validité des certificats (mois) ; null = sans expiration. */
  dureeValiditeMois: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Module d'une formation ; `ordre` est attribué par le serveur (1, 2, 3…). */
export interface ModuleVue {
  id: string;
  titre: string;
  ordre: number;
  description: string | null;
}

/** Détail d'une formation : la formation + ses modules triés par ordre. */
export interface FormationDetailVue extends FormationVue {
  modules: ModuleVue[];
}

/** État d'une inscription (l'enum backend reste la source de vérité). */
export type StatutInscription = 'EN_COURS' | 'TERMINEE' | 'SUSPENDUE';

/**
 * Ce que le catalogue ajoute à une formation (US-INSC-01) : les places
 * restantes, et l'inscription de l'apprenant connecté (null s'il n'en a pas,
 * toujours null pour un autre rôle).
 */
export interface PlacesEtInscription {
  placesRestantes: number;
  statutInscription: StatutInscription | null;
}

/** Formation telle que la renvoie le catalogue (liste). */
export type FormationCatalogueVue = FormationVue & PlacesEtInscription;

/** Formation et modules tels que les renvoie le catalogue (détail). */
export type FormationCatalogueDetailVue = FormationDetailVue & PlacesEtInscription;

/** Réponse paginée de GET /api/formations. */
export interface FormationPage {
  items: FormationCatalogueVue[];
  total: number;
  page: number;
  limit: number;
}

/** Corps de création. Le statut n'y figure pas : le serveur impose OUVERTE. */
export interface FormationInput {
  titre: string;
  description?: string;
  objectifs?: string;
  prerequis?: string;
  dateDebut?: string;
  dateFin?: string;
  dureeHeures?: number;
  capaciteMax: number;
  noteMinCertification: number;
  modeleCertificat?: string;
  dureeValiditeMois?: number;
}

/** Corps de modification : champs facultatifs ; `null` vide un champ optionnel. */
export type FormationPatch = {
  [Champ in keyof FormationInput]?: FormationInput[Champ] | null;
};

/**
 * Lit une réponse JSON de l'API formations. En cas d'échec, lève une
 * AdminError portant le message EXACT du backend (chaîne, ou erreurs de
 * validation concaténées) et le code HTTP.
 */
async function lireReponseFormation<T>(response: Response, parDefaut: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok) {
    throw new AdminError(messageErreur(data) ?? parDefaut, response.status);
  }
  return data as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * GET /api/formations — liste paginée. Un administrateur voit tous les
 * statuts (filtre libre) ; les autres rôles ne voient que le catalogue OUVERTE.
 */
export async function getFormations(
  query: { statut?: StatutFormation; page?: number; limit?: number } = {},
): Promise<FormationPage> {
  const params = new URLSearchParams();
  if (query.statut) params.set('statut', query.statut);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  const response = await apiFetch(`/api/formations${qs ? `?${qs}` : ''}`);
  return lireReponseFormation<FormationPage>(response, 'Impossible de charger les formations.');
}

/** GET /api/formations/:id — une formation et ses modules. */
export async function getFormation(id: string): Promise<FormationCatalogueDetailVue> {
  const response = await apiFetch(`/api/formations/${id}`);
  return lireReponseFormation<FormationCatalogueDetailVue>(
    response,
    'Impossible de charger la formation.',
  );
}

/**
 * POST /api/admin/formations — crée une formation (ADMINISTRATEUR).
 *   - 400 -> capacité ≤ 0, seuil hors [0,100], titre vide, dates incohérentes ;
 *   - 403 -> pas administrateur.
 */
export async function createFormation(input: FormationInput): Promise<FormationVue> {
  const response = await apiFetch('/api/admin/formations', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<FormationVue>(response, 'Impossible de créer la formation.');
}

/**
 * PATCH /api/admin/formations/:id — modifie la configuration.
 *   - 400 -> aucune modification / valeur invalide ;
 *   - 409 -> formation archivée, ou capacité sous le nombre d'inscrits.
 */
export async function updateFormation(id: string, patch: FormationPatch): Promise<FormationVue> {
  const response = await apiFetch(`/api/admin/formations/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return lireReponseFormation<FormationVue>(response, 'Impossible de modifier la formation.');
}

/** POST /api/admin/formations/:id/modules — ajoute un module en fin de liste. */
export async function addFormationModule(
  formationId: string,
  input: { titre: string; description?: string },
): Promise<ModuleVue> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/modules`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<ModuleVue>(response, "Impossible d'ajouter le module.");
}

/** PATCH /api/admin/formations/:id/modules/:moduleId — titre / description. */
export async function updateFormationModule(
  formationId: string,
  moduleId: string,
  patch: { titre?: string; description?: string | null },
): Promise<ModuleVue> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/modules/${moduleId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return lireReponseFormation<ModuleVue>(response, 'Impossible de modifier le module.');
}

/**
 * PUT /api/admin/formations/:id/modules/ordre — réordonne TOUS les modules.
 * `moduleIds` doit contenir chaque module de la formation, une fois.
 */
export async function reorderFormationModules(
  formationId: string,
  moduleIds: string[],
): Promise<ModuleVue[]> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/modules/ordre`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ moduleIds }),
  });
  return lireReponseFormation<ModuleVue[]>(response, 'Impossible de réordonner les modules.');
}

/**
 * DELETE /api/admin/formations/:id/modules/:moduleId — 204 sans corps.
 *   - 409 -> le module contient déjà une évaluation.
 */
export async function deleteFormationModule(formationId: string, moduleId: string): Promise<void> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/modules/${moduleId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de supprimer le module.');
  }
}

/* ============================================================
 * US-FORM-03 — Formateurs affectés à une formation
 * ============================================================ */

/**
 * Formateur affecté à une formation. `id` est celui du COMPTE (attendu par la
 * route de retrait). `role` et `statut` sont ceux du compte AUJOURD'HUI : un
 * formateur rétrogradé ou désactivé après son affectation reste dans la liste.
 * `affecteLe` est un horodatage ISO.
 */
export interface FormateurAffecte {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  role: RoleUtilisateur;
  statut: string;
  affecteLe: string;
}

/** GET /api/admin/formations/:id/formateurs — du plus ancien au plus récent. */
export async function getFormationFormateurs(formationId: string): Promise<FormateurAffecte[]> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/formateurs`);
  return lireReponseFormation<FormateurAffecte[]>(
    response,
    'Impossible de charger les formateurs de la formation.',
  );
}

/**
 * POST /api/admin/formations/:id/formateurs — affecte un formateur.
 *   - 400 -> le compte n'a pas le rôle Formateur, ou n'est pas actif ;
 *   - 404 -> formation ou utilisateur introuvable ;
 *   - 409 -> déjà affecté, ou formation archivée.
 * Le serveur prévient le formateur par email.
 */
export async function assignFormationFormateur(
  formationId: string,
  formateurId: string,
): Promise<FormateurAffecte> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/formateurs`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ formateurId }),
  });
  return lireReponseFormation<FormateurAffecte>(response, "Impossible d'affecter le formateur.");
}

/**
 * DELETE /api/admin/formations/:id/formateurs/:formateurId — 204 sans corps.
 *   - 404 -> ce formateur n'est pas affecté à la formation ;
 *   - 409 -> formation archivée.
 */
export async function removeFormationFormateur(
  formationId: string,
  formateurId: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/admin/formations/${formationId}/formateurs/${formateurId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de retirer le formateur.');
  }
}

/* ============================================================
 * US-AUTH-16 — Espace formateur : mes formations
 * ============================================================ */

/** Une formation vue par le formateur qui y est affecté (`affecteLe` en ISO). */
export interface MaFormation extends FormationVue {
  affecteLe: string;
}

/**
 * GET /api/formateur/formations — formations affectées au formateur connecté,
 * TOUS statuts (fermées et archivées comprises), la plus récente d'abord.
 *   - 403 -> le compte n'est pas formateur.
 */
export async function getMesFormations(): Promise<MaFormation[]> {
  const response = await apiFetch('/api/formateur/formations');
  return lireReponseFormation<MaFormation[]>(response, 'Impossible de charger vos formations.');
}

/**
 * GET /api/formateur/formations/:id — une formation et ses modules, quel que
 * soit son statut. Protégé par l'autorisation par ressource :
 *   - 403 -> formateur non affecté à cette formation (refus tracé) ;
 *   - 404 -> formation introuvable.
 */
export async function getMaFormation(id: string): Promise<FormationDetailVue> {
  const response = await apiFetch(`/api/formateur/formations/${id}`);
  return lireReponseFormation<FormationDetailVue>(response, 'Impossible de charger la formation.');
}


/* ============================================================
 * US-INSC-01 — Inscription aux formations (apprenant)
 * ============================================================ */

/** Une inscription de l'apprenant connecté (`dateInscription` en ISO). */
export interface InscriptionVue {
  id: string;
  statut: StatutInscription;
  dateInscription: string;
  dateEcheance: string | null;
  tauxAvancement: number;
  formation: {
    id: string;
    titre: string;
    statut: StatutFormation;
    dateDebut: string | null;
    dateFin: string | null;
  };
}

/**
 * POST /api/formations/:id/inscriptions — inscrit l'apprenant connecté.
 * L'inscription est immédiate (EN_COURS). Le message exact du backend remonte :
 *   - 404 -> formation introuvable ou plus ouverte ;
 *   - 409 -> déjà inscrit, inscription suspendue, ou formation complète ;
 *   - 403 -> le compte n'est pas apprenant.
 */
export async function inscrireFormation(formationId: string): Promise<InscriptionVue> {
  const response = await apiFetch(`/api/formations/${formationId}/inscriptions`, {
    method: 'POST',
  });
  return lireReponseFormation<InscriptionVue>(response, 'Impossible de vous inscrire.');
}

/** GET /api/mes-inscriptions — mes inscriptions, tous statuts, la plus récente d'abord. */
export async function getMesInscriptions(): Promise<InscriptionVue[]> {
  const response = await apiFetch('/api/mes-inscriptions');
  return lireReponseFormation<InscriptionVue[]>(response, 'Impossible de charger vos inscriptions.');
}


/* ============================================================
 * US-INSC-04 — Mon espace dans une formation (apprenant)
 * ============================================================ */

/** Où en est l'apprenant sur un QCM, d'après SES tentatives. */
export type AvancementQcm = 'A_FAIRE' | 'EN_COURS' | 'REUSSI' | 'ECHOUE';

/** Où en est l'apprenant sur un module, d'après ses QCM publiés. */
export type AvancementModule = 'SANS_EVALUATION' | 'A_FAIRE' | 'COMPLETE';

/** Fenêtre d'ouverture d'un QCM publié, au moment de la requête (US-QCM-04). */
export type EtatFenetre = 'A_VENIR' | 'OUVERTE' | 'FERMEE';

/** « Mon espace » : formation, mon inscription, modules et QCM publiés (sans questions). */
export interface EspaceFormationVue {
  formation: {
    id: string;
    titre: string;
    description: string | null;
    objectifs: string | null;
    prerequis: string | null;
    dateDebut: string | null;
    dateFin: string | null;
    dureeHeures: number | null;
    statut: StatutFormation;
    noteMinCertification: number;
  };
  inscription: {
    id: string;
    statut: StatutInscription;
    dateInscription: string;
    dateEcheance: string | null;
    tauxAvancement: number;
  };
  modules: Array<{
    id: string;
    titre: string;
    ordre: number;
    description: string | null;
    avancement: AvancementModule;
    qcms: Array<{
      id: string;
      titre: string;
      description: string | null;
      avancement: AvancementQcm;
      dateOuverture: string | null;
      dateFermeture: string | null;
      fenetre: EtatFenetre | null;
      // US-QCM-05 — à savoir avant de démarrer (le serveur revérifie tout).
      dureeMaxMinutes: number | null;
      nbTentativesMax: number | null;
      nbTentativesPassees: number;
      tentativeEnCoursId: string | null;
      // US-QCM-12 — surveillance webcam activée par le formateur.
      surveillanceWebcam: boolean;
    }>;
    // US-ATEL-03 — ateliers publiés du module (sans énoncé).
    ateliers: AtelierEspace[];
    // US-FORM-05 — ressources du cours (liens, vidéos), dans l'ordre du formateur.
    ressources: RessourceCours[];
  }>;
  /** US-ATEL-09 — où en est ma certification (et mon certificat s'il est demandé). */
  certification: {
    eligible: boolean;
    raison: string | null;
    validees: number;
    requises: number;
    certificat: { id: string; statut: StatutCertificat } | null;
  };
}

/**
 * GET /api/formations/:id/mon-espace — mon espace dans une formation.
 *   - 403 -> pas inscrit, inscription suspendue, ou compte non apprenant
 *     (message exact du serveur).
 */
export async function getMonEspace(formationId: string): Promise<EspaceFormationVue> {
  const response = await apiFetch(`/api/formations/${formationId}/mon-espace`);
  return lireReponseFormation<EspaceFormationVue>(
    response,
    'Impossible de charger votre espace de formation.',
  );
}


/* ============================================================
 * US-QCM-01 — Contenu des QCM (formateur affecté, administrateur)
 * ============================================================ */

/** Statut d'un QCM (l'enum backend reste la source de vérité). */
export type StatutQcm = 'BROUILLON' | 'NON_PUBLIE' | 'PUBLIE';

/** Types de questions pris en charge par le serveur. */
export type TypeQuestion = 'QCU' | 'QCM' | 'VRAI_FAUX';

/** Niveaux de difficulté proposés. */
export type NiveauDifficulte = 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE';

/** Un QCM dans une liste (sans ses questions). */
export interface QcmResume {
  id: string;
  moduleId: string;
  titre: string;
  description: string | null;
  statut: StatutQcm;
  nbQuestions: number;
  createdAt: string;
  updatedAt: string;
}

/** Une option vue par le formateur (bonne réponse comprise). */
export interface OptionQcm {
  id: string;
  texte: string;
  estCorrecte: boolean;
  ordre: number;
}

/** Une question vue par le formateur. */
export interface QuestionQcm {
  id: string;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  explication: string | null;
  niveauDifficulte: NiveauDifficulte | null;
  /** Saisie manuelle ou issue d'une suggestion IA (US-IA-04). */
  origine: OrigineQuestion;
  ordre: number;
  options: OptionQcm[];
}

/** Origine d'une question (US-IA-04). */
export type OrigineQuestion = 'MANUELLE' | 'IA' | 'IA_MODIFIEE';

/** Affichage du résultat à l'apprenant (US-QCM-03). */
export type AffichageResultats = 'IMMEDIAT' | 'DIFFERE';

/** Paramètres anti-fraude d'un QCM (dates en ISO 8601). */
export interface ConfigurationQcm {
  randomiserQuestions: boolean;
  randomiserOptions: boolean;
  nbQuestionsTirees: number | null;
  dureeMaxMinutes: number;
  dateOuverture: string;
  dateFermeture: string;
  nbTentativesMax: number;
  delaiEntreTentatives: number;
  blocageSessionsMultiples: boolean;
  affichageResultats: AffichageResultats;
  scoreMinValidation: number;
  ponderationFormation: number;
  proctoringWebcam: boolean;
  desactiverCopierColler: boolean;
}

/**
 * Détail d'un QCM pour son éditeur ; `verrouille` = des tentatives existent ;
 * `configuration` = paramètres anti-fraude, null tant qu'ils ne sont pas
 * enregistrés (US-QCM-03).
 */
export interface QcmDetail extends QcmResume {
  formationId: string;
  verrouille: boolean;
  configuration: (ConfigurationQcm & { updatedAt: string }) | null;
  questions: QuestionQcm[];
}

/** Corps d'ajout ou de remplacement d'une question. */
export interface QuestionInput {
  enonce: string;
  type: TypeQuestion;
  ponderation?: number;
  explication?: string;
  niveauDifficulte?: NiveauDifficulte;
  options: Array<{ texte: string; estCorrecte: boolean }>;
}

/** GET /api/modules/:id/qcm — les QCM d'un module (formateur affecté / admin). */
export async function getQcmsDuModule(moduleId: string): Promise<QcmResume[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/qcm`);
  return lireReponseFormation<QcmResume[]>(response, 'Impossible de charger les QCM du module.');
}

/** POST /api/modules/:id/qcm — crée un QCM au statut BROUILLON. */
export async function createQcm(
  moduleId: string,
  input: { titre: string; description?: string },
): Promise<QcmResume> {
  const response = await apiFetch(`/api/modules/${moduleId}/qcm`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<QcmResume>(response, 'Impossible de créer le QCM.');
}

/** GET /api/qcm/:id — le QCM, ses questions et les bonnes réponses. */
export async function getQcm(qcmId: string): Promise<QcmDetail> {
  const response = await apiFetch(`/api/qcm/${qcmId}`);
  return lireReponseFormation<QcmDetail>(response, 'Impossible de charger le QCM.');
}

/** PATCH /api/qcm/:id — titre et/ou description (`null` vide la description). */
export async function updateQcm(
  qcmId: string,
  patch: { titre?: string; description?: string | null },
): Promise<QcmDetail> {
  const response = await apiFetch(`/api/qcm/${qcmId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return lireReponseFormation<QcmDetail>(response, 'Impossible de modifier le QCM.');
}

/** DELETE /api/qcm/:id — 409 si publié ou déjà tenté. */
export async function deleteQcm(qcmId: string): Promise<void> {
  const response = await apiFetch(`/api/qcm/${qcmId}`, { method: 'DELETE' });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de supprimer le QCM.');
  }
}

/** POST /api/qcm/:id/questions — ajoute une question en fin de QCM. */
export async function addQuestion(qcmId: string, input: QuestionInput): Promise<QuestionQcm> {
  const response = await apiFetch(`/api/qcm/${qcmId}/questions`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<QuestionQcm>(response, "Impossible d'ajouter la question.");
}

/** PUT /api/qcm/:id/questions/:questionId — remplace une question. */
export async function replaceQuestion(
  qcmId: string,
  questionId: string,
  input: QuestionInput,
): Promise<QuestionQcm> {
  const response = await apiFetch(`/api/qcm/${qcmId}/questions/${questionId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<QuestionQcm>(response, 'Impossible de modifier la question.');
}

/** PUT /api/qcm/:id/questions/ordre — toutes les questions, dans le nouvel ordre. */
export async function reorderQuestions(qcmId: string, questionIds: string[]): Promise<QcmDetail> {
  const response = await apiFetch(`/api/qcm/${qcmId}/questions/ordre`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ questionIds }),
  });
  return lireReponseFormation<QcmDetail>(response, 'Impossible de réordonner les questions.');
}

/** DELETE /api/qcm/:id/questions/:questionId — retire une question. */
export async function deleteQuestion(qcmId: string, questionId: string): Promise<void> {
  const response = await apiFetch(`/api/qcm/${qcmId}/questions/${questionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de retirer la question.');
  }
}

/**
 * PUT /api/qcm/:id/configuration — crée ou remplace les paramètres
 * anti-fraude (US-QCM-03). Le QCM passe de BROUILLON à NON_PUBLIE.
 *   - 400 -> champ invalide ou règle croisée (fenêtre, durée, tirage) ;
 *   - 409 -> QCM sans question, ou déjà tenté (seule la fermeture peut être repoussée).
 */
export async function configureQcm(
  qcmId: string,
  configuration: ConfigurationQcm,
): Promise<ConfigurationQcm> {
  const response = await apiFetch(`/api/qcm/${qcmId}/configuration`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(configuration),
  });
  return lireReponseFormation<ConfigurationQcm>(
    response,
    'Impossible d’enregistrer les paramètres anti-fraude.',
  );
}

/**
 * PATCH /api/qcm/:id/publier — publie le QCM (US-QCM-04) : il devient
 * visible des apprenants inscrits, avec sa fenêtre d'ouverture.
 *   - 409 -> « QCM incomplet pour publication » (sans question, sans
 *     configuration, tirage trop grand), fenêtre close, ou déjà publié
 *     (message exact du serveur).
 */
export async function publishQcm(qcmId: string): Promise<QcmDetail> {
  const response = await apiFetch(`/api/qcm/${qcmId}/publier`, { method: 'PATCH' });
  return lireReponseFormation<QcmDetail>(response, 'Impossible de publier le QCM.');
}

/* ============================================================
 * US-QCM-05 — Démarrer une tentative (apprenant)
 * ============================================================ */

/** Statut d'une tentative (énumération StatutTentative du backend). */
export type StatutTentative = 'EN_COURS' | 'SOUMISE' | 'ABANDONNEE_TIMER' | 'NOTEE';

/** Motif machine d'un démarrage refusé (409, DS-02). */
export type RaisonRefusTentative =
  | 'hors_fenetre'
  | 'tentatives_epuisees'
  | 'delai_non_respecte'
  // US-QCM-10 — la tentative EN_COURS est ouverte sur un autre appareil.
  | 'session_active_ailleurs'
  // US-QCM-12 — QCM surveillé : consentement requis.
  | 'consentement_surveillance_requis';

/**
 * US-QCM-10 — Conseil affiché après le message du serveur quand la tentative
 * est détenue par une autre session (autre appareil, autre navigateur).
 */
export const CONSEIL_SESSION_AILLEURS =
  'Terminez-la sur l’autre appareil, ou déconnectez-vous de celui-ci pour la reprendre ici. Sinon, elle se terminera à son échéance.';

/** Réponse de POST /api/qcm/:id/tentatives (201 créée, 200 reprise). */
export interface TentativeDemarree {
  id: string;
  qcmId: string;
  statut: StatutTentative;
  dateDebut: string;
  dateLimite: string;
  dureeMaxMinutes: number;
  numero: number;
  nbTentativesMax: number;
  tentativesRestantes: number;
  reprise: boolean;
}

/**
 * Une question telle que l'apprenant la reçoit (US-QCM-06) : jamais la bonne
 * réponse, l'explication ni la pondération — le serveur ne les envoie pas.
 */
export interface QuestionTentative {
  id: string;
  enonce: string;
  type: TypeQuestion;
  options: Array<{ id: string; texte: string }>;
}

/** Réponse de GET /api/tentatives/:id — `maintenant` = heure du serveur. */
export interface TentativeConsultee {
  // US-QCM-12 — surveillance webcam de cette tentative (capture au démarrage
  // puis toutes les `intervalleSecondes`).
  surveillance?: { active: boolean; intervalleSecondes: number };
  id: string;
  qcmId: string;
  qcmTitre: string;
  formationId: string;
  statut: StatutTentative;
  dateDebut: string;
  dateLimite: string;
  dateFin: string | null;
  dureeMaxMinutes: number;
  numero: number;
  nbTentativesMax: number;
  tentativesRestantes: number;
  maintenant: string;
  // US-QCM-06 — questions dans l'ordre du tirage figé ; vide hors du temps de passage.
  nbQuestions: number;
  questions: QuestionTentative[];
  // US-QCM-07 — mes réponses déjà enregistrées (questionId -> options cochées) ;
  // vide hors du temps de passage.
  reponses: Record<string, string[]>;
  // US-QCM-08 — note figée (pourcentage) et réussite ; null tant que la
  // tentative n'est pas NOTEE.
  score: number | null;
  estReussie: boolean | null;
  // US-QCM-09 — le corrigé est-il disponible, sinon pourquoi et à partir de
  // quand. Aucune réponse ici : le corrigé a sa propre route.
  correction: EtatCorrection;
}

/**
 * Démarrage refusé : en plus du message exact du serveur, le motif et la date
 * à partir de laquelle un nouveau démarrage pourra réussir (quand elle existe).
 */
export class TentativeRefusee extends AdminError {
  constructor(
    message: string,
    statut: number,
    public readonly raison: RaisonRefusTentative | null,
    public readonly dateReouverture: string | null,
  ) {
    super(message, statut);
  }
}

/**
 * POST /api/qcm/:id/tentatives — démarre (ou reprend) ma tentative.
 *   - 403 -> pas inscrit, inscription suspendue ou terminée ;
 *   - 404 -> QCM introuvable ou non publié ;
 *   - 409 -> TentativeRefusee : hors fenêtre, tentatives épuisées, délai.
 */
export async function demarrerTentative(
  qcmId: string,
  options: { consentementSurveillance?: boolean } = {},
): Promise<TentativeDemarree> {
  const response = await apiFetch(`/api/qcm/${qcmId}/tentatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    raison?: RaisonRefusTentative;
    dateReouverture?: string | null;
  };
  if (!response.ok) {
    throw new TentativeRefusee(
      messageErreur(data) ?? 'Impossible de démarrer l’évaluation.',
      response.status,
      data.raison ?? null,
      data.dateReouverture ?? null,
    );
  }
  return data as TentativeDemarree;
}

/**
 * GET /api/tentatives/:id — une de mes tentatives (404 pour celle d'un autre).
 * US-QCM-10 : 409 `session_active_ailleurs` (PassageRefuse) si elle est en
 * cours sur un autre appareil.
 */
export async function getTentative(tentativeId: string): Promise<TentativeConsultee> {
  const response = await apiFetch(`/api/tentatives/${tentativeId}`);
  return lireReponsePassage<TentativeConsultee>(
    response,
    'Impossible de charger cette tentative.',
  );
}

/* ============================================================
 * US-QCM-07 — Enregistrer ses réponses et soumettre (apprenant)
 * ============================================================ */

/** Réponse de PUT /api/tentatives/:id/reponses/:questionId. */
export interface ReponseEnregistree {
  questionId: string;
  // Options retenues, dans l'ordre du tirage.
  optionIds: string[];
  // null : réponse effacée (liste vide).
  enregistreeLe: string | null;
  // Heure du serveur et échéance : de quoi recaler le compte à rebours.
  maintenant: string;
  dateLimite: string;
}

/**
 * Réponse de POST /api/tentatives/:id/soumettre : notée dans la foulée
 * (US-QCM-08) -> NOTEE avec `score` et `estReussie` ; SOUMISE et null si la
 * notation n'a pas encore abouti.
 */
export interface TentativeSoumise {
  id: string;
  qcmId: string;
  statut: StatutTentative;
  score: number | null;
  estReussie: boolean | null;
  dateDebut: string;
  dateLimite: string;
  dateFin: string;
  // Secondes.
  dureeEffective: number;
  nbQuestions: number;
  nbReponses: number;
}

/** Motif machine d'un refus pendant le passage (400 ou 409). */
export type RaisonRefusPassage =
  | 'temps_ecoule'
  | 'tentative_terminee'
  | 'question_hors_tirage'
  | 'option_hors_question'
  | 'une_seule_option'
  | 'type_non_pris_en_charge'
  // US-QCM-10 — tentative en cours sur un autre appareil (409).
  | 'session_active_ailleurs';

/**
 * Refus pendant le passage : message exact du serveur et motif. Un 409
 * `temps_ecoule` ou `tentative_terminee` signifie que la tentative est finie.
 */
export class PassageRefuse extends AdminError {
  constructor(
    message: string,
    statut: number,
    public readonly raison: RaisonRefusPassage | null,
  ) {
    super(message, statut);
  }

  get tentativeFinie(): boolean {
    return this.raison === 'temps_ecoule' || this.raison === 'tentative_terminee';
  }

  /** US-QCM-10 — la tentative continue, mais sur un autre appareil. */
  get sessionAilleurs(): boolean {
    return this.raison === 'session_active_ailleurs';
  }
}

async function lireReponsePassage<T>(response: Response, parDefaut: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    raison?: RaisonRefusPassage;
  };
  if (!response.ok) {
    throw new PassageRefuse(messageErreur(data) ?? parDefaut, response.status, data.raison ?? null);
  }
  return data as T;
}

/**
 * PUT /api/tentatives/:id/reponses/:questionId — remplace ma réponse à une
 * question ; `[]` l'efface. Le serveur vérifie l'échéance à chaque appel.
 */
export async function enregistrerReponse(
  tentativeId: string,
  questionId: string,
  optionIds: string[],
): Promise<ReponseEnregistree> {
  const response = await apiFetch(`/api/tentatives/${tentativeId}/reponses/${questionId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ optionIds }),
  });
  return lireReponsePassage<ReponseEnregistree>(response, 'Réponse non enregistrée.');
}

/** POST /api/tentatives/:id/soumettre — soumet ma tentative (après confirmation). */
export async function soumettreTentative(tentativeId: string): Promise<TentativeSoumise> {
  const response = await apiFetch(`/api/tentatives/${tentativeId}/soumettre`, { method: 'POST' });
  return lireReponsePassage<TentativeSoumise>(response, 'Impossible de soumettre la tentative.');
}

/* ============================================================
 * US-QCM-09 — Voir son résultat : corrigé selon le mode d'affichage
 * ============================================================ */

/** Motif machine d'un corrigé indisponible (409). */
export type RaisonCorrection = 'non_notee' | 'correction_differee' | 'tentatives_restantes';

/** État du corrigé, porté par GET /api/tentatives/:id. */
export interface EtatCorrection {
  mode: AffichageResultats;
  disponible: boolean;
  raison: RaisonCorrection | null;
  // Fermeture du QCM : date à laquelle le corrigé sera au plus tard disponible.
  disponibleLe: string | null;
}

/** Une question du corrigé, dans l'ordre du tirage. */
export interface QuestionCorrigee {
  id: string;
  enonce: string;
  type: TypeQuestion;
  ponderation: number;
  repondue: boolean;
  // Juste / faux et points : ce que la notation du serveur a écrit.
  estCorrecte: boolean;
  pointsObtenus: number;
  explication: string | null;
  options: Array<{ id: string; texte: string; cochee: boolean; estCorrecte: boolean }>;
}

/** Réponse de GET /api/tentatives/:id/correction. */
export interface CorrectionTentative {
  tentativeId: string;
  qcmId: string;
  qcmTitre: string;
  mode: AffichageResultats;
  score: number;
  estReussie: boolean;
  scoreMinValidation: number;
  nbQuestions: number;
  nbCorrectes: number;
  questions: QuestionCorrigee[];
}

/** Corrigé refusé : message exact du serveur, motif et date de disponibilité. */
export class CorrectionIndisponible extends AdminError {
  constructor(
    message: string,
    statut: number,
    public readonly raison: RaisonCorrection | null,
    public readonly disponibleLe: string | null,
  ) {
    super(message, statut);
  }
}

/**
 * GET /api/tentatives/:id/correction — corrigé d'une de mes tentatives notées.
 *   - 404 -> tentative inconnue ou d'un autre apprenant ;
 *   - 409 -> CorrectionIndisponible : non notée, différé, tentatives restantes.
 */
export async function getCorrection(tentativeId: string): Promise<CorrectionTentative> {
  const response = await apiFetch(`/api/tentatives/${tentativeId}/correction`);
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    raison?: RaisonCorrection;
    disponibleLe?: string | null;
  };
  if (!response.ok) {
    throw new CorrectionIndisponible(
      messageErreur(data) ?? 'Impossible de charger le corrigé.',
      response.status,
      data.raison ?? null,
      data.disponibleLe ?? null,
    );
  }
  return data as CorrectionTentative;
}

/* ============================================================
 * US-ATEL-01 — Ateliers (formateur affecté, administrateur)
 * ============================================================ */

/** Statut d'un atelier (l'enum backend reste la source de vérité). */
export type StatutAtelier = 'BROUILLON' | 'PUBLIE' | 'ARCHIVE';

/**
 * Extensions de livrable acceptées par le serveur (liste fermée, même ordre
 * que `atelier.regles.ts`) : documents et archives, puis code source.
 */
export const EXTENSIONS_DOCUMENT = [
  'pdf',
  'zip',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'md',
  'png',
  'jpg',
] as const;
export const EXTENSIONS_CODE = [
  'js',
  'ts',
  'py',
  'java',
  'c',
  'cpp',
  'cs',
  'php',
  'sql',
  'html',
  'css',
  'json',
  'ipynb',
] as const;
export const EXTENSIONS_LIVRABLE = [...EXTENSIONS_DOCUMENT, ...EXTENSIONS_CODE] as const;
export type ExtensionLivrable = (typeof EXTENSIONS_LIVRABLE)[number];

/** Un atelier dans la liste d'un module (sans son énoncé). */
export interface AtelierResume {
  id: string;
  moduleId: string;
  titre: string;
  dateLimite: string;
  typesLivrables: ExtensionLivrable[];
  statut: StatutAtelier;
  createdAt: string;
  updatedAt: string;
}

/** Fiche complète d'un atelier. */
export interface AtelierDetail extends AtelierResume {
  formationId: string;
  moduleTitre: string;
  enonce: string;
  competencesVisees: string | null;
  tailleMaxMo: number;
  nbMaxFichiers: number;
  toleranceRetardHeures: number;
}

/** Corps de création (la date limite en ISO 8601). */
export interface AtelierInput {
  titre: string;
  enonce: string;
  competencesVisees?: string;
  dateLimite: string;
  typesLivrables: ExtensionLivrable[];
  tailleMaxMo?: number;
  nbMaxFichiers?: number;
  toleranceRetardHeures?: number;
}

/** GET /api/modules/:id/ateliers — les ateliers d'un module (tous statuts). */
export async function getAteliersDuModule(moduleId: string): Promise<AtelierResume[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/ateliers`);
  return lireReponseFormation<AtelierResume[]>(
    response,
    'Impossible de charger les ateliers du module.',
  );
}

/** POST /api/modules/:id/ateliers — crée un atelier au statut BROUILLON. */
export async function createAtelier(moduleId: string, input: AtelierInput): Promise<AtelierDetail> {
  const response = await apiFetch(`/api/modules/${moduleId}/ateliers`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<AtelierDetail>(response, 'Impossible de créer l’atelier.');
}

/** GET /api/ateliers/:id — la fiche complète. */
export async function getAtelier(atelierId: string): Promise<AtelierDetail> {
  const response = await apiFetch(`/api/ateliers/${atelierId}`);
  return lireReponseFormation<AtelierDetail>(response, 'Impossible de charger l’atelier.');
}

/** PATCH /api/ateliers/:id — brouillon seulement (`competencesVisees: null` les efface). */
export async function updateAtelier(
  atelierId: string,
  patch: Partial<Omit<AtelierInput, 'competencesVisees'>> & { competencesVisees?: string | null },
): Promise<AtelierDetail> {
  const response = await apiFetch(`/api/ateliers/${atelierId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return lireReponseFormation<AtelierDetail>(response, 'Impossible de modifier l’atelier.');
}

/**
 * PATCH /api/ateliers/:id/publier — publie l'atelier (US-ATEL-03) : visible
 * des apprenants inscrits, contenu et grille figés.
 *   - 409 -> grille absente ou non validée, déjà publié, formation archivée ;
 *   - 400 -> date limite déjà passée (message exact du serveur).
 */
export async function publishAtelier(atelierId: string): Promise<AtelierDetail> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/publier`, { method: 'PATCH' });
  return lireReponseFormation<AtelierDetail>(response, 'Impossible de publier l’atelier.');
}

/** DELETE /api/ateliers/:id — 409 si l'atelier n'est plus en brouillon. */
export async function deleteAtelier(atelierId: string): Promise<void> {
  const response = await apiFetch(`/api/ateliers/${atelierId}`, { method: 'DELETE' });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de supprimer l’atelier.');
  }
}

/* ============================================================
 * US-ATEL-02 — Grille de notation pondérée et modèles
 * ============================================================ */

/** Les 4 niveaux, dans l'ordre (le rang fixe le libellé côté serveur). */
export const LIBELLES_NIVEAUX = ['Insuffisant', 'Acceptable', 'Bon', 'Excellent'] as const;

/** Plages par défaut en % des points du critère (exemple de l'UC4). */
export const PLAGES_PAR_DEFAUT: ReadonlyArray<readonly [number, number]> = [
  [0, 25],
  [25, 50],
  [50, 75],
  [75, 100],
];

export interface NiveauPerformance {
  ordre: number;
  libelle: string;
  pointsMinPct: number;
  pointsMaxPct: number;
  descripteur: string | null;
}

export interface CritereGrille {
  id: string;
  ordre: number;
  intitule: string;
  ponderation: number;
  description: string | null;
  niveaux: NiveauPerformance[];
}

/** La grille d'un atelier (`id` null tant qu'aucun critère n'a été écrit). */
export interface GrilleNotation {
  id: string | null;
  atelierId: string;
  statutAtelier: StatutAtelier;
  modifiable: boolean;
  validee: boolean;
  totalPonderations: number;
  criteres: CritereGrille[];
  updatedAt: string | null;
}

/** Un niveau saisi : plage en % du critère, descripteur facultatif. */
export interface NiveauInput {
  pointsMinPct: number;
  pointsMaxPct: number;
  descripteur?: string | null;
}

export interface CritereInput {
  intitule: string;
  ponderation: number;
  description?: string | null;
  niveaux?: NiveauInput[];
}

/** Un modèle de grille (« Partir d'un modèle »). */
export interface ModeleGrille {
  id: string;
  nomModele: string;
  nbCriteres: number;
  totalPonderations: number;
  criteres: Array<{ intitule: string; ponderation: number }>;
  estAMoi: boolean;
  createdAt: string;
}

/** GET /api/ateliers/:id/grille — n'écrit rien (grille vide tant que non commencée). */
export async function getGrille(atelierId: string): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille`);
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de charger la grille.');
}

/**
 * POST /api/ateliers/:id/grille/criteres — 400 si le total dépasserait 100 %
 * ou si les plages des niveaux sont incohérentes ; 409 hors brouillon.
 */
export async function addCritere(atelierId: string, input: CritereInput): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/criteres`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible d’ajouter le critère.');
}

/** PATCH /api/ateliers/:id/grille/criteres/:critereId — retire la validation. */
export async function updateCritere(
  atelierId: string,
  critereId: string,
  patch: Partial<CritereInput>,
): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/criteres/${critereId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de modifier le critère.');
}

/** DELETE /api/ateliers/:id/grille/criteres/:critereId — renvoie la grille à jour. */
export async function deleteCritere(atelierId: string, critereId: string): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/criteres/${critereId}`, {
    method: 'DELETE',
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de supprimer le critère.');
}

/** PUT /api/ateliers/:id/grille/criteres/ordre — liste complète, dans l'ordre voulu. */
export async function reorderCriteres(
  atelierId: string,
  critereIds: string[],
): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/criteres/ordre`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ critereIds }),
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de réordonner les critères.');
}

/** POST /api/ateliers/:id/grille/valider — 400 si le total n'est pas exactement 100 %. */
export async function validerGrille(atelierId: string): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/valider`, {
    method: 'POST',
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de valider la grille.');
}

/** POST /api/ateliers/:id/grille/modele — enregistre une copie (409 nom déjà pris). */
export async function enregistrerModele(atelierId: string, nomModele: string): Promise<ModeleGrille> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/modele`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ nomModele }),
  });
  return lireReponseFormation<ModeleGrille>(response, 'Impossible d’enregistrer le modèle.');
}

/** POST /api/ateliers/:id/grille/copier — remplace la grille par une copie du modèle. */
export async function copierModele(atelierId: string, modeleId: string): Promise<GrilleNotation> {
  const response = await apiFetch(`/api/ateliers/${atelierId}/grille/copier`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ modeleId }),
  });
  return lireReponseFormation<GrilleNotation>(response, 'Impossible de copier le modèle.');
}

/** GET /api/grilles/modeles — mes modèles (administrateur : tous). */
export async function getModelesGrille(): Promise<ModeleGrille[]> {
  const response = await apiFetch('/api/grilles/modeles');
  return lireReponseFormation<ModeleGrille[]>(response, 'Impossible de charger les modèles.');
}

/** DELETE /api/grilles/modeles/:id — les grilles déjà copiées restent intactes. */
export async function deleteModeleGrille(modeleId: string): Promise<void> {
  const response = await apiFetch(`/api/grilles/modeles/${modeleId}`, { method: 'DELETE' });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de supprimer le modèle.');
  }
}

/* ============================================================
 * US-ATEL-03 — Ateliers publiés, côté apprenant
 * ============================================================ */

/** Où en est le dépôt (calculé par le serveur, horloge PostgreSQL). */
export type EtatDepot = 'OUVERT' | 'EN_RETARD' | 'CLOS';

/** Un atelier publié dans « Mon espace » (sans énoncé). */
export interface AtelierEspace {
  id: string;
  titre: string;
  dateLimite: string;
  toleranceRetardHeures: number;
  typesLivrables: ExtensionLivrable[];
  etatDepot: EtatDepot;
  /** US-ATEL-04 — statut de mon livrable (null : rien déposé). */
  statutMonLivrable: StatutLivrable | null;
  /** US-ATEL-08 — livrable noté dont je n'ai pas encore ouvert le feedback. */
  nouveauFeedback: boolean;
}

/** Fiche d'un atelier publié, avec sa grille en lecture. */
export interface AtelierApprenant {
  id: string;
  formationId: string;
  formationTitre: string;
  moduleId: string;
  moduleTitre: string;
  titre: string;
  enonce: string;
  competencesVisees: string | null;
  dateLimite: string;
  toleranceRetardHeures: number;
  typesLivrables: ExtensionLivrable[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
  etatDepot: EtatDepot;
  grille: { totalPonderations: number; criteres: CritereGrille[] };
  /** US-ATEL-04 — mon livrable, ou null si rien n'est déposé (US-ATEL-08 : avec son feedback). */
  monLivrable: LivrableApprenant | null;
}

/** US-ATEL-08 — la note d'un critère, telle que l'apprenant la lit. */
export interface NoteFeedback {
  critereId: string;
  ordre: number;
  intitule: string;
  ponderation: number;
  niveau: number;
  libelleNiveau: string;
  pointsPct: number;
  contribution: number;
  commentaire: string | null;
}

/** US-ATEL-08 — le feedback d'un livrable noté (null avant l'envoi). */
export interface FeedbackLivrable {
  scoreFinal: number;
  commentaireGeneral: string;
  dateFinalisation: string;
  correcteur: { prenom: string | null; nom: string | null };
  criteres: NoteFeedback[];
}

/**
 * GET /api/mes-ateliers/:id — la fiche d'un atelier publié de ma formation.
 *   - 404 -> atelier inconnu ou pas encore publié ;
 *   - 403 -> pas inscrit, ou inscription suspendue (message exact du serveur).
 */
export async function getMonAtelier(atelierId: string): Promise<AtelierApprenant> {
  const response = await apiFetch(`/api/mes-ateliers/${atelierId}`);
  return lireReponseFormation<AtelierApprenant>(response, 'Impossible de charger l’atelier.');
}

/* ============================================================
 * US-ATEL-04 — Soumettre un livrable (apprenant)
 * ============================================================ */

export type StatutLivrable = 'SOUMIS' | 'EN_CORRECTION' | 'NOTE';

/** Mon livrable pour un atelier (le hash prouve l'antériorité du contenu). */
export interface LivrableApprenant {
  id: string;
  atelierId: string;
  version: number;
  statut: StatutLivrable;
  dateSoumission: string;
  enRetard: boolean;
  hashTracabilite: string;
  commentaire: string | null;
  liens: string[];
  fichiers: Array<{
    ordre: number;
    nomOriginal: string;
    extension: string;
    tailleOctets: number;
    sha256: string;
  }>;
  /** US-ATEL-08 — présent sur la fiche : le feedback une fois noté, sinon null. */
  feedback?: FeedbackLivrable | null;
}

/**
 * POST /api/ateliers/:id/livrable (multipart) — dépose le livrable.
 *   - 400 -> fichier refusé (format, contenu, taille, nombre), lien ou
 *     commentaire invalide (message exact du serveur) ;
 *   - 409 -> date limite dépassée, ou livrable déjà soumis ;
 *   - 403 / 404 / 503 -> message exact du serveur.
 */
export async function soumettreLivrable(
  atelierId: string,
  depot: { fichiers: File[]; commentaire: string; liens: string[] },
): Promise<LivrableApprenant> {
  const corps = new FormData();
  for (const f of depot.fichiers) corps.append('fichiers', f, f.name);
  if (depot.commentaire.trim().length > 0) corps.append('commentaire', depot.commentaire);
  for (const lien of depot.liens) corps.append('liens', lien);
  const response = await apiFetch(`/api/ateliers/${atelierId}/livrable`, {
    method: 'POST',
    body: corps,
  });
  return lireReponseFormation<LivrableApprenant>(response, 'Impossible de soumettre le livrable.');
}

/**
 * US-ATEL-05 — PUT /api/ateliers/:id/livrable : remplace mon livrable (avant
 * la date limite, tant qu'il n'est pas en correction) ; version + 1.
 */
export async function remplacerLivrable(
  atelierId: string,
  depot: { fichiers: File[]; commentaire: string; liens: string[] },
): Promise<LivrableApprenant> {
  const corps = new FormData();
  for (const f of depot.fichiers) corps.append('fichiers', f, f.name);
  if (depot.commentaire.trim().length > 0) corps.append('commentaire', depot.commentaire);
  for (const lien of depot.liens) corps.append('liens', lien);
  const response = await apiFetch(`/api/ateliers/${atelierId}/livrable`, {
    method: 'PUT',
    body: corps,
  });
  return lireReponseFormation<LivrableApprenant>(response, 'Impossible de remplacer le livrable.');
}

/* ============================================================
 * US-ATEL-06 — Corriger un livrable critère par critère (formateur)
 * ============================================================ */

/** Avancement d'une correction : critères notés / critères de la grille. */
export interface AvancementCorrection {
  notes: number;
  total: number;
  complete: boolean;
}

/** L'apprenant d'un livrable, vu par le formateur. */
export interface ApprenantLivrable {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
}

/** Une ligne de la liste « Livrables » d'un atelier. */
export interface LivrableResume {
  id: string;
  apprenant: ApprenantLivrable;
  version: number;
  statut: StatutLivrable;
  dateSoumission: string;
  enRetard: boolean;
  nbFichiers: number;
  /** null tant que la correction n'est pas ouverte. */
  avancement: AvancementCorrection | null;
  /** US-ATEL-07 — score figé à l'envoi du feedback ; null avant. */
  scoreFinal: number | null;
}

/** La note d'un critère (points en % du critère). */
export interface NoteCritere {
  critereId: string;
  niveau: number;
  libelleNiveau: string;
  pointsPct: number;
  contribution: number;
  commentaire: string | null;
  updatedAt: string;
}

/** La correction d'un livrable. */
export interface CorrectionLivrable {
  id: string;
  statut: 'EN_COURS' | 'TERMINEE';
  dateOuverture: string;
  correcteur: { id: string; prenom: string | null; nom: string | null };
  notes: NoteCritere[];
  scoreActuel: number;
  avancement: AvancementCorrection;
  /** US-ATEL-07 — renseignés une fois le feedback envoyé (immuables). */
  scoreFinal: number | null;
  commentaireGeneral: string | null;
  dateFinalisation: string | null;
}

/** Le livrable à corriger, sa grille et sa correction. */
export interface LivrableACorriger {
  id: string;
  atelier: { id: string; titre: string; formationId: string; formationTitre: string };
  apprenant: ApprenantLivrable;
  version: number;
  statut: StatutLivrable;
  dateSoumission: string;
  enRetard: boolean;
  hashTracabilite: string;
  commentaire: string | null;
  liens: string[];
  fichiers: LivrableApprenant['fichiers'];
  criteres: CritereGrille[];
  correction: CorrectionLivrable | null;
}

/** Réponse à l'enregistrement d'une note. */
export interface NoteEnregistree {
  note: NoteCritere;
  scoreActuel: number;
  avancement: AvancementCorrection;
}

/** GET /api/ateliers/:id/livrables — les livrables d'un atelier (premier déposé en tête). */
export async function getLivrablesAtelier(
  atelierId: string,
  statut?: StatutLivrable,
): Promise<LivrableResume[]> {
  const qs = statut ? `?statut=${statut}` : '';
  const response = await apiFetch(`/api/ateliers/${atelierId}/livrables${qs}`);
  return lireReponseFormation<LivrableResume[]>(response, 'Impossible de charger les livrables.');
}

/** GET /api/livrables/:id — le livrable, sa grille et sa correction (null si pas ouverte). */
export async function getLivrableACorriger(livrableId: string): Promise<LivrableACorriger> {
  const response = await apiFetch(`/api/livrables/${livrableId}`);
  return lireReponseFormation<LivrableACorriger>(response, 'Impossible de charger le livrable.');
}

/**
 * PATCH /api/livrables/:id/ouvrir — SOUMIS -> EN_CORRECTION.
 *   - 409 -> déjà en correction ou déjà noté, ou formation archivée.
 */
export async function ouvrirCorrection(livrableId: string): Promise<LivrableACorriger> {
  const response = await apiFetch(`/api/livrables/${livrableId}/ouvrir`, { method: 'PATCH' });
  return lireReponseFormation<LivrableACorriger>(response, 'Impossible d’ouvrir la correction.');
}

/**
 * PUT /api/livrables/:id/correction/criteres/:critereId — note (ou renote) un critère.
 *   - 400 -> points hors de la plage du niveau, plus de deux décimales… ;
 *   - 409 -> correction pas ouverte, livrable déjà noté, formation archivée.
 */
export async function noterCritere(
  livrableId: string,
  critereId: string,
  note: { niveau: number; pointsPct: number; commentaire: string | null },
): Promise<NoteEnregistree> {
  const response = await apiFetch(
    `/api/livrables/${livrableId}/correction/criteres/${critereId}`,
    { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(note) },
  );
  return lireReponseFormation<NoteEnregistree>(response, 'Impossible d’enregistrer la note.');
}

/**
 * GET /api/livrables/:id/fichiers/:ordre — télécharge un fichier du livrable.
 * Le jeton n'accompagne pas un simple lien : je récupère le contenu avec
 * apiFetch, puis je le propose au navigateur sous son nom d'origine.
 */
export async function telechargerFichierLivrable(
  livrableId: string,
  ordre: number,
  nomOriginal: string,
): Promise<void> {
  const response = await apiFetch(`/api/livrables/${livrableId}/fichiers/${ordre}`);
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de télécharger le fichier.');
  }
  const url = URL.createObjectURL(await response.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomOriginal;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * US-ATEL-07 — POST /api/livrables/:id/correction/finaliser — envoie le
 * feedback (immuable ensuite) et prévient l'apprenant.
 *   - 400 -> correction incomplète, commentaire général manquant ;
 *   - 409 -> correction pas ouverte, déjà envoyée, formation archivée.
 */
export async function finaliserCorrection(
  livrableId: string,
  commentaireGeneral: string,
): Promise<LivrableACorriger> {
  const response = await apiFetch(`/api/livrables/${livrableId}/correction/finaliser`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ commentaireGeneral }),
  });
  return lireReponseFormation<LivrableACorriger>(response, 'Impossible d’envoyer le feedback.');
}

/* ============================================================
 * US-CERT-01 — Émission asynchrone des certificats (suivi administrateur)
 * ============================================================ */

export type StatutCertificat =
  | 'EN_ATTENTE_GENERATION'
  | 'EN_GENERATION'
  | 'ACTIF'
  | 'REVOQUE'
  | 'EXPIRE';

/** Un certificat dans la liste de l'administrateur. */
export interface CertificatAdmin {
  id: string;
  statut: StatutCertificat;
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
  formation: { id: string; titre: string };
  scoreFinal: number;
  mention: string;
  dateEmission: string;
  dateGeneration: string | null;
  empreinteSha256: string | null;
  nbTentatives: number;
  derniereErreur: string | null;
  /** US-CERT-02 — échec définitif (tentatives épuisées), null sinon. */
  echecDefinitifLe: string | null;
  /** US-CERT-07 — fin de validité ; null = sans expiration. */
  dateExpiration: string | null;
  /** US-CERT-08 — certificat révoqué remplacé par celui-ci, et réémission de celui-ci. */
  remplaceCertificatId: string | null;
  remplacePar: string | null;
  /** US-CERT-06 — null tant que le certificat n'est pas révoqué. */
  revocation: {
    date: string;
    motif: MotifRevocation;
    description: string;
    revoquePar: string;
  } | null;
  /** US-DASH-02 — vérifications publiques (journal d'audit). */
  consultations: { total: number; derniere: string | null };
}

/** US-DASH-02 — Un événement de l'historique d'un certificat. */
export interface EvenementCertificat {
  horodatage: string;
  action: string;
  resultat: string | null;
  acteur: { id: string; email: string; prenom: string | null; nom: string | null } | null;
  details: Record<string, unknown> | null;
}

/** US-DASH-02 — Fiche détaillée d'un certificat (administrateur). */
export interface FicheCertificat {
  certificat: CertificatAdmin;
  consultations: { total: number; valides: number; refusees: number; derniere: string | null };
  /** 20 dernières vérifications publiques : date et verdict (pas d'adresse IP). */
  consultationsRecentes: Array<{ horodatage: string; verdict: string | null }>;
  historique: EvenementCertificat[];
}

/** Motif d'une révocation (US-CERT-06, DS-07). */
export type MotifRevocation = 'FRAUDE' | 'ERREUR_ADMIN' | 'DISCIPLINAIRE' | 'JUDICIAIRE';

/**
 * GET /api/admin/certificats — plus récents d'abord ; filtres facultatifs
 * `statut` et (US-DASH-02) `recherche` : titulaire, formation, identifiant.
 */
export async function getCertificatsAdmin(
  statut?: StatutCertificat,
  recherche?: string,
  enEchec = false,
): Promise<CertificatAdmin[]> {
  const params = new URLSearchParams();
  if (statut) params.set('statut', statut);
  if (recherche) params.set('recherche', recherche);
  if (enEchec) params.set('enEchec', 'true');
  const qs = params.toString();
  const response = await apiFetch(`/api/admin/certificats${qs ? `?${qs}` : ''}`);
  return lireReponseFormation<CertificatAdmin[]>(response, 'Impossible de charger les certificats.');
}

/** US-DASH-02 — GET /api/admin/certificats/:id : fiche détaillée (404 inconnu). */
export async function getFicheCertificat(certificatId: string): Promise<FicheCertificat> {
  const response = await apiFetch(`/api/admin/certificats/${certificatId}`);
  return lireReponseFormation<FicheCertificat>(response, 'Impossible de charger la fiche du certificat.');
}

/**
 * US-CERT-09 — GET /api/admin/certificats/:id/pdf : le PDF d'un certificat
 * généré (actif, expiré ou révoqué), en Blob pour l'aperçu et le
 * téléchargement depuis le panneau de supervision. 409 : pas encore généré.
 */
export async function getPdfCertificatAdmin(certificatId: string): Promise<Blob> {
  const response = await apiFetch(`/api/admin/certificats/${certificatId}/pdf`);
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible d’ouvrir le PDF du certificat.');
  }
  return response.blob();
}

/**
 * POST /api/admin/certificats/:id/relancer — relance la génération.
 *   - 409 -> certificat déjà actif ou révoqué.
 */
export async function relancerCertificat(certificatId: string): Promise<CertificatAdmin> {
  const response = await apiFetch(`/api/admin/certificats/${certificatId}/relancer`, {
    method: 'POST',
  });
  return lireReponseFormation<CertificatAdmin>(response, 'Impossible de relancer la génération.');
}

/**
 * US-CERT-08 — POST /api/admin/certificats/:id/reemettre : nouveau certificat
 * pour un certificat révoqué pour erreur administrative (409 sinon ou déjà réémis).
 */
export async function reemettreCertificat(certificatId: string): Promise<CertificatAdmin> {
  const response = await apiFetch(`/api/admin/certificats/${certificatId}/reemettre`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ confirmer: true }),
  });
  return lireReponseFormation<CertificatAdmin>(response, 'Impossible de réémettre le certificat.');
}

/**
 * POST /api/admin/certificats/:id/revoquer — révocation IRRÉVERSIBLE (US-CERT-06).
 *   - 401 -> mot de passe administrateur invalide ;
 *   - 409 -> déjà révoqué, ou encore en préparation.
 */
export async function revoquerCertificat(
  certificatId: string,
  corps: {
    motif: MotifRevocation;
    description: string;
    confirmationIrreversible: boolean;
    motDePasseAdmin: string;
  },
): Promise<CertificatAdmin> {
  const response = await apiFetch(`/api/admin/certificats/${certificatId}/revoquer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  return lireReponseFormation<CertificatAdmin>(response, 'Impossible de révoquer le certificat.');
}

/* ============================================================
 * US-CERT-03 — Mes certificats (apprenant)
 * ============================================================ */

/** Un de mes certificats (empreinte et lien public une fois émis). */
export interface MonCertificat {
  id: string;
  formation: { id: string; titre: string };
  statut: StatutCertificat;
  scoreFinal: number;
  mention: string;
  organismeEmetteur: string;
  dateEmission: string;
  dateGeneration: string | null;
  empreinteSha256: string | null;
  urlVerification: string | null;
  /** US-CERT-06 — date et catégorie du motif ; null si non révoqué. */
  revocation: { date: string; motif: MotifRevocation } | null;
  /** US-CERT-07 — fin de validité ; null = sans expiration. */
  dateExpiration: string | null;
}

/** GET /api/mes-certificats — plus récents d'abord. */
export async function getMesCertificats(): Promise<MonCertificat[]> {
  const response = await apiFetch('/api/mes-certificats');
  return lireReponseFormation<MonCertificat[]>(response, 'Impossible de charger vos certificats.');
}

/**
 * GET /api/mes-certificats/:id/pdf — télécharge le PDF (jeton requis : je le
 * récupère avec apiFetch puis le propose au navigateur).
 *   - 409 -> en cours d'émission, ou révoqué (message exact du serveur).
 */
export async function telechargerMonCertificat(certificatId: string, nom: string): Promise<void> {
  const response = await apiFetch(`/api/mes-certificats/${certificatId}/pdf`);
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de télécharger le certificat.');
  }
  const url = URL.createObjectURL(await response.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
 * US-CERT-04 — Vérification publique (SANS compte : fetch simple)
 * ============================================================ */

export type VerdictCertificat = 'VALIDE' | 'REVOQUE' | 'EXPIRE' | 'INTEGRITE_COMPROMISE';

/** Ce que la vérification publique révèle (minimisation, DS-05). */
export interface VerificationCertificat {
  certificatId: string;
  verdict: VerdictCertificat;
  integrite: 'VERIFIEE' | 'COMPROMISE' | 'NON_VERIFIABLE';
  titulaire: string;
  formation: string;
  organismeEmetteur: string;
  mention: string;
  scoreFinal: number;
  dateEmission: string;
  empreinteSha256: string;
  /** US-CERT-06 — date de révocation (le motif n'est jamais publié). */
  dateRevocation: string | null;
  /** US-CERT-07 — fin de validité ; null = sans expiration. */
  dateExpiration: string | null;
  /** US-CERT-08 — certificat réémis qui remplace celui-ci ; null sinon. */
  remplacePar: string | null;
}

/**
 * GET /api/verification/:id — sans jeton (fetch simple : jamais de
 * redirection vers /login). null si le certificat est inconnu (404).
 */
export async function verifierCertificat(id: string): Promise<VerificationCertificat | null> {
  const response = await fetch(`/api/verification/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (response.status === 429) {
    // US-CERT-05 : limitation de débit — le message du serveur dit quand réessayer.
    const corps = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new AdminError(
      corps?.message ?? 'Trop de vérifications : réessayez dans une minute.',
      response.status,
    );
  }
  if (!response.ok) {
    throw new AdminError('La vérification est momentanément indisponible : réessayez.', response.status);
  }
  return (await response.json()) as VerificationCertificat;
}

/** SHA-256 (hexadécimal) d'un fichier, calculé DANS le navigateur (rien n'est envoyé). */
export async function empreinteFichier(fichier: File): Promise<string> {
  const condensat = await crypto.subtle.digest('SHA-256', await fichier.arrayBuffer());
  return Array.from(new Uint8Array(condensat))
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('');
}

/* ============================================================
 * US-IA-01 — Supports pédagogiques pour l'assistance IA (formateur)
 * ============================================================ */

export type StatutSupport = 'EN_INDEXATION' | 'INDEXE' | 'ECHEC_INDEXATION';

/** Formats acceptés pour un support (le serveur revérifie le contenu). */
export const EXTENSIONS_SUPPORT = ['pdf', 'pptx', 'docx', 'txt', 'md'] as const;
export const TAILLE_MAX_SUPPORT = 20 * 1024 * 1024;

/** Un support d'un module, vu par le formateur. */
export interface SupportPedagogique {
  id: string;
  moduleId: string;
  titre: string;
  nomOriginal: string;
  extension: string;
  tailleOctets: number;
  sha256: string;
  statut: StatutSupport;
  nbSegments: number | null;
  nbCaracteres: number | null;
  modeleEmbeddings: string | null;
  nbTentatives: number;
  derniereErreur: string | null;
  dateDepot: string;
  dateIndexation: string | null;
  deposePar: { id: string; prenom: string | null; nom: string | null };
}

/** GET /api/modules/:id/supports — supports du module, plus récents d'abord. */
export async function getSupportsDuModule(moduleId: string): Promise<SupportPedagogique[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/supports`);
  return lireReponseFormation<SupportPedagogique[]>(
    response,
    'Impossible de charger les supports du module.',
  );
}

/**
 * POST /api/modules/:id/supports (multipart) — dépose un support ; réponse
 * 202 : l'indexation se poursuit en arrière-plan.
 */
export async function deposerSupport(
  moduleId: string,
  depot: { fichier: File; titre: string },
): Promise<SupportPedagogique> {
  const corps = new FormData();
  corps.append('fichier', depot.fichier, depot.fichier.name);
  if (depot.titre.trim().length > 0) corps.append('titre', depot.titre.trim());
  const response = await apiFetch(`/api/modules/${moduleId}/supports`, {
    method: 'POST',
    body: corps,
  });
  return lireReponseFormation<SupportPedagogique>(response, 'Impossible de déposer le support.');
}

/** POST /api/supports/:id/reindexer — relance l'indexation d'un support en échec. */
export async function reindexerSupport(supportId: string): Promise<SupportPedagogique> {
  const response = await apiFetch(`/api/supports/${supportId}/reindexer`, { method: 'POST' });
  return lireReponseFormation<SupportPedagogique>(response, 'Impossible de relancer l’indexation.');
}

/** DELETE /api/supports/:id — supprime le support (fichier, passages, vecteurs). */
export async function supprimerSupport(supportId: string): Promise<void> {
  const response = await apiFetch(`/api/supports/${supportId}`, { method: 'DELETE' });
  if (!response.ok) {
    await lireReponseFormation<unknown>(response, 'Impossible de supprimer le support.');
  }
}

/* ============================================================
 * US-IA-02 — Lancer une génération de questions par IA (formateur)
 * ============================================================ */

export type StatutGeneration = 'EN_COURS' | 'TERMINEE' | 'ECHEC';
export const TYPES_GENERABLES = ['QCU', 'QCM', 'VRAI_FAUX'] as const;
export type TypeGenerable = (typeof TYPES_GENERABLES)[number];
export const NIVEAUX_GENERATION = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'] as const;
export type NiveauGeneration = (typeof NIVEAUX_GENERATION)[number];

/** Une génération, vue par le formateur. */
export interface GenerationIa {
  id: string;
  moduleId: string;
  support: { id: string; titre: string };
  formateur: { id: string; prenom: string | null; nom: string | null };
  nbQuestionsDemandees: number;
  types: TypeGenerable[];
  niveau: NiveauGeneration;
  focusThematique: string | null;
  statut: StatutGeneration;
  modeleLlm: string | null;
  nbSuggestions: number | null;
  nbInvalides: number | null;
  nbTentatives: number;
  derniereErreur: string | null;
  dateLancement: string;
  dateFin: string | null;
}

export interface ParametresGeneration {
  supportId: string;
  nbQuestions: number;
  types: TypeGenerable[];
  niveau: NiveauGeneration;
  focusThematique?: string;
}

/** POST /api/modules/:id/generations — 202, génération EN_COURS. */
export async function lancerGeneration(
  moduleId: string,
  parametres: ParametresGeneration,
): Promise<GenerationIa> {
  const response = await apiFetch(`/api/modules/${moduleId}/generations`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(parametres),
  });
  return lireReponseFormation<GenerationIa>(response, 'Impossible de lancer la génération.');
}

/** GET /api/modules/:id/generations — plus récentes d'abord. */
export async function getGenerationsDuModule(moduleId: string): Promise<GenerationIa[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/generations`);
  return lireReponseFormation<GenerationIa[]>(response, 'Impossible de charger les générations.');
}

export type StatutSuggestion = 'PROPOSEE' | 'ACCEPTEE' | 'MODIFIEE' | 'REJETEE';

/** Une question proposée par l'IA (US-IA-03), avant ou après relecture (US-IA-04). */
export interface SuggestionQuestion {
  id: string;
  generationId: string;
  ordre: number;
  enonce: string;
  type: TypeGenerable;
  options: Array<{ texte: string; estCorrecte: boolean }>;
  explication: string | null;
  scoreConfiance: number | null;
  passagesSources: number[];
  statut: StatutSuggestion;
  questionId: string | null;
  qcmId: string | null;
  decidePar: string | null;
  dateDecision: string | null;
  motifRejet: string | null;
}

/** POST /api/suggestions/:id/accepter — telle quelle, ou `question` retouchée (US-IA-04). */
export async function accepterSuggestion(
  suggestionId: string,
  qcmId: string,
  question?: QuestionInput,
): Promise<{ suggestion: SuggestionQuestion; question: QuestionQcm }> {
  const response = await apiFetch(`/api/suggestions/${suggestionId}/accepter`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ qcmId, ...(question ? { question } : {}) }),
  });
  return lireReponseFormation(response, 'Impossible d’accepter la suggestion.');
}

/** POST /api/suggestions/:id/rejeter — motif facultatif (US-IA-04). */
export async function rejeterSuggestion(
  suggestionId: string,
  motif?: string,
): Promise<SuggestionQuestion> {
  const response = await apiFetch(`/api/suggestions/${suggestionId}/rejeter`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(motif ? { motif } : {}),
  });
  return lireReponseFormation<SuggestionQuestion>(response, 'Impossible de rejeter la suggestion.');
}

/** GET /api/generations/:id/suggestions — dans l'ordre du modèle. */
export async function getSuggestionsGeneration(generationId: string): Promise<SuggestionQuestion[]> {
  const response = await apiFetch(`/api/generations/${generationId}/suggestions`);
  return lireReponseFormation<SuggestionQuestion[]>(
    response,
    'Impossible de charger les suggestions.',
  );
}

/* ============================================================
 * US-FORM-05 — Ressources de module : liens et vidéos
 * ============================================================ */

export type PlateformeRessource = 'YOUTUBE' | 'VIMEO' | 'WEB';

/** Une ressource du cours (même vue côté formateur et côté apprenant). */
export interface RessourceCours {
  id: string;
  ordre: number;
  nature: 'LIEN' | 'FICHIER';
  titre: string;
  description: string | null;
  url: string | null;
  plateforme: PlateformeRessource | null;
  videoId: string | null;
  debutSecondes: number | null;
  domaine: string | null;
  /** US-FORM-06 — fichier (null pour un lien). */
  fichier: {
    nomOriginal: string;
    extension: string;
    tailleOctets: number;
    /** Lisible dans la plateforme ; null : à télécharger. */
    lecture: 'VIDEO' | 'AUDIO' | 'PDF' | 'IMAGE' | null;
  } | null;
}

/**
 * Adresse du lecteur INTÉGRÉ d'une vidéo, construite à partir de son
 * identifiant (jamais de l'adresse saisie) : YouTube en mode « sans cookie »,
 * Vimeo sans suivi. null pour un lien qui n'est pas une vidéo.
 */
export function lecteurVideo(r: RessourceCours): string | null {
  if (!r.videoId) return null;
  if (r.plateforme === 'YOUTUBE') {
    const debut = r.debutSecondes ? `&start=${r.debutSecondes}` : '';
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.videoId)}?rel=0&autoplay=1${debut}`;
  }
  if (r.plateforme === 'VIMEO') {
    const debut = r.debutSecondes ? `#t=${r.debutSecondes}s` : '';
    return `https://player.vimeo.com/video/${encodeURIComponent(r.videoId)}?dnt=1&autoplay=1${debut}`;
  }
  return null;
}

/** GET /api/modules/:id/ressources — ordre d'affichage. */
export async function getRessourcesDuModule(moduleId: string): Promise<RessourceCours[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/ressources`);
  return lireReponseFormation<RessourceCours[]>(response, 'Impossible de charger les ressources.');
}

/** POST /api/modules/:id/ressources/liens. */
export async function ajouterLien(
  moduleId: string,
  lien: { titre: string; url: string; description?: string },
): Promise<RessourceCours> {
  const response = await apiFetch(`/api/modules/${moduleId}/ressources/liens`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(lien),
  });
  return lireReponseFormation<RessourceCours>(response, 'Impossible d’ajouter le lien.');
}

/** PATCH /api/ressources/:id. */
export async function modifierRessource(
  ressourceId: string,
  champs: { titre?: string; url?: string; description?: string },
): Promise<RessourceCours> {
  const response = await apiFetch(`/api/ressources/${ressourceId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(champs),
  });
  return lireReponseFormation<RessourceCours>(response, 'Impossible de modifier la ressource.');
}

/** PUT /api/modules/:id/ressources/ordre — liste complète. */
export async function reordonnerRessources(
  moduleId: string,
  ids: string[],
): Promise<RessourceCours[]> {
  const response = await apiFetch(`/api/modules/${moduleId}/ressources/ordre`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids }),
  });
  return lireReponseFormation<RessourceCours[]>(response, 'Impossible de réordonner les ressources.');
}

/** DELETE /api/ressources/:id. */
export async function supprimerRessource(ressourceId: string): Promise<void> {
  const response = await apiFetch(`/api/ressources/${ressourceId}`, { method: 'DELETE' });
  if (!response.ok) {
    await lireReponseFormation<unknown>(response, 'Impossible de retirer la ressource.');
  }
}

/* ============================================================
 * US-FORM-06 — Ressources de module : fichiers
 * ============================================================ */

/** POST /api/modules/:id/ressources/fichiers (multipart). */
export async function deposerFichierRessource(
  moduleId: string,
  depot: { fichier: File; titre: string; description: string },
): Promise<RessourceCours> {
  const corps = new FormData();
  corps.append('fichier', depot.fichier, depot.fichier.name);
  if (depot.titre.trim()) corps.append('titre', depot.titre.trim());
  if (depot.description.trim()) corps.append('description', depot.description.trim());
  const response = await apiFetch(`/api/modules/${moduleId}/ressources/fichiers`, {
    method: 'POST',
    body: corps,
  });
  return lireReponseFormation<RessourceCours>(response, 'Impossible de déposer le fichier.');
}

/**
 * POST /api/ressources/:id/lien — lien signé (10 min) pour lire ou
 * télécharger le fichier : un <video> ou un onglet ne peut pas envoyer le
 * jeton d'accès, ce lien le remplace.
 */
export async function lienLectureRessource(ressourceId: string): Promise<string> {
  const response = await apiFetch(`/api/ressources/${ressourceId}/lien`, { method: 'POST' });
  const { url } = await lireReponseFormation<{ url: string }>(
    response,
    'Impossible d’ouvrir le fichier.',
  );
  return url;
}

// ---------------------------------------------------------------------------
// US-DASH-01 — Tableau de bord global (ADMINISTRATEUR).
// ---------------------------------------------------------------------------

export interface PeriodeTableau {
  du: string;
  au: string;
  jours: number;
}

export type CodeAlerteSysteme =
  | 'CERTIFICATS_BLOQUES'
  | 'SUPPORTS_EN_ECHEC'
  | 'GENERATIONS_EN_ECHEC'
  | 'DEMANDES_ROLE_EN_ATTENTE'
  | 'LIVRABLES_EN_ATTENTE';

export interface TableauDeBordGlobal {
  periode: PeriodeTableau;
  utilisateurs: {
    parRole: Record<string, number>;
    parStatut: Record<string, number>;
    total: number;
    nouveaux: number;
    connectes: number;
  };
  formations: { parStatut: Record<string, number>; total: number; nouvelles: number };
  inscriptions: { parStatut: Record<string, number>; total: number; nouvelles: number };
  evaluations: {
    qcm: {
      tentativesNotees: number;
      reussies: number;
      tauxReussite: number;
      scoreMoyen: number | null;
      enCours: number;
    };
    ateliers: {
      livrablesSoumis: number;
      correctionsFinalisees: number;
      noteMoyenne: number | null;
      enAttenteCorrection: number;
      enCorrection: number;
    };
  };
  certificats: {
    parStatut: Record<string, number>;
    emis: number;
    revoques: number;
    consultations: number;
  };
  activite: Array<{ jour: string; evenements: number; connexions: number; echecs: number }>;
  activiteRecente: Array<{
    horodatage: string;
    action: string;
    resultat: string | null;
    acteur: { email: string; prenom: string | null; nom: string | null } | null;
  }>;
  alertes: Array<{ code: CodeAlerteSysteme; nombre: number }>;
  /** US-DASH-03 — demandes qui attendent une décision (zéro compris). */
  demandesEnAttente: { role: number; affectation: number; propositions: number };
}

/**
 * US-DASH-01 — GET /api/admin/tableau-de-bord?du&au (jours inclus, AAAA-MM-JJ).
 *   - 400 -> date invalide, période inversée ou trop longue (message de l'API).
 */
export async function getTableauDeBordGlobal(
  periode: { du?: string; au?: string } = {},
): Promise<TableauDeBordGlobal> {
  const params = new URLSearchParams();
  if (periode.du) params.set('du', periode.du);
  if (periode.au) params.set('au', periode.au);
  const qs = params.toString();
  const response = await apiFetch(`/api/admin/tableau-de-bord${qs ? `?${qs}` : ''}`);
  return lireReponseFormation<TableauDeBordGlobal>(
    response,
    'Impossible de charger le tableau de bord.',
  );
}

// ---------------------------------------------------------------------------
// US-DASH-03 — Tableau de bord global du formateur (toutes ses formations).
// ---------------------------------------------------------------------------

export interface FormationTableauDeBordFormateur {
  id: string;
  titre: string;
  statut: StatutFormation;
  inscrits: number;
  actifs: number;
  tentativesNotees: number;
  tauxReussite: number;
  scoreMoyen: number | null;
  tentativesAEvaluer: number;
  livrablesAEvaluer: number;
  alertesOuvertes: number;
  certificatsDelivres: number;
}

export interface TableauDeBordFormateur {
  periode: { du: string; au: string; jours: number };
  formations: { parStatut: Record<string, number>; total: number };
  apprenants: { inscrits: number; actifs: number; nouveaux: number };
  qcm: {
    tentativesNotees: number;
    reussies: number;
    tauxReussite: number;
    scoreMoyen: number | null;
    aEvaluer: number;
  };
  ateliers: { livrablesAEvaluer: number };
  alertesOuvertes: number;
  certificatsDelivres: number;
  activite: Array<{ jour: string; tentatives: number; livrables: number }>;
  mesFormations: FormationTableauDeBordFormateur[];
}

/**
 * US-DASH-03 — GET /api/formateur/tableau-de-bord?du&au (jours inclus).
 *   - 400 -> date invalide, période inversée ou trop longue (message de l'API).
 */
export async function getTableauDeBordFormateur(
  periode: { du?: string; au?: string } = {},
): Promise<TableauDeBordFormateur> {
  const params = new URLSearchParams();
  if (periode.du) params.set('du', periode.du);
  if (periode.au) params.set('au', periode.au);
  const qs = params.toString();
  const response = await apiFetch(`/api/formateur/tableau-de-bord${qs ? `?${qs}` : ''}`);
  return lireReponseFormation<TableauDeBordFormateur>(
    response,
    'Impossible de charger le tableau de bord.',
  );
}

// ---------------------------------------------------------------------------
// US-SUIVI-01 — Suivi pédagogique d'une formation (formateur affecté).
// ---------------------------------------------------------------------------

export interface ApprenantSuivi {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  statutInscription: StatutInscription;
  dateInscription: string;
  derniereConnexion: string | null;
  derniereActivite: string | null;
  avancement: number;
  qcm: { reussis: number; passes: number; total: number; scoreMoyen: number | null };
  ateliers: {
    rendus: number;
    notes: number;
    total: number;
    noteMoyenne: number | null;
    enRetard: number;
    nonRendus: number;
  };
  moyenne: number | null;
  certificat: StatutCertificat | null;
  risque: { inactif: boolean; joursSansConnexion: number };
  /** US-SUIVI-02 — critères des alertes ouvertes. */
  alertes: string[];
}

export interface SuiviFormation {
  formation: { id: string; titre: string; statut: StatutFormation };
  kpis: {
    inscrits: number;
    actifs: number;
    inactifs: number;
    termines: number;
    suspendus: number;
    tauxCompletion: number;
    scoreMoyenQcm: number | null;
    noteMoyenneAteliers: number | null;
    certifies: number;
    alertesOuvertes: number;
    qcmPublies: number;
    ateliersPublies: number;
  };
  histogramme: Array<{ tranche: string; min: number; max: number; effectif: number }>;
  apprenants: ApprenantSuivi[];
}

export interface FicheApprenantSuivi {
  apprenant: ApprenantSuivi;
  tentatives: Array<{
    id: string;
    qcmId: string;
    qcmTitre: string;
    dateDebut: string;
    dateFin: string | null;
    dureeEffective: number | null;
    score: number | null;
    reussie: boolean | null;
    statut: StatutTentative;
  }>;
  livrables: Array<{
    id: string;
    atelierId: string;
    atelierTitre: string;
    version: number;
    dateSoumission: string;
    enRetard: boolean;
    statut: StatutLivrable;
    note: number | null;
  }>;
  certificat: {
    id: string;
    statut: StatutCertificat;
    scoreFinal: number;
    dateGeneration: string | null;
  } | null;
  chronologie: Array<{ date: string; type: string; libelle: string }>;
  alertes: Array<{
    id: string;
    critere: string;
    statut: string;
    donnees: Record<string, unknown>;
    suggestion: string;
    dateCreation: string;
    dateTraitement: string | null;
  }>;
}

/** US-SUIVI-01 — GET /api/formateur/formations/:id/suivi (403 si non affecté). */
export async function getSuiviFormation(formationId: string): Promise<SuiviFormation> {
  const response = await apiFetch(`/api/formateur/formations/${formationId}/suivi`);
  return lireReponseFormation<SuiviFormation>(response, 'Impossible de charger le suivi.');
}

/** US-SUIVI-01 — GET /api/formateur/formations/:id/apprenants/:apprenantId. */
export async function getFicheApprenantSuivi(
  formationId: string,
  apprenantId: string,
): Promise<FicheApprenantSuivi> {
  const response = await apiFetch(
    `/api/formateur/formations/${formationId}/apprenants/${apprenantId}`,
  );
  return lireReponseFormation<FicheApprenantSuivi>(
    response,
    'Impossible de charger la fiche de l’apprenant.',
  );
}

// ---------------------------------------------------------------------------
// US-SUIVI-02 — Alertes de décrochage (formateur affecté, administrateur).
// ---------------------------------------------------------------------------

export type CritereAlerte = 'INACTIVITE' | 'ECHECS_QCM' | 'LIVRABLE_EN_RETARD' | 'SCORE_EN_CHUTE';
export type StatutAlerte = 'OUVERTE' | 'TRAITEE';

export interface AlerteDecrochage {
  id: string;
  critere: CritereAlerte;
  statut: StatutAlerte;
  donnees: Record<string, unknown>;
  suggestion: string;
  dateCreation: string;
  dateTraitement: string | null;
  formation: { id: string; titre: string };
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
}

/** US-SUIVI-02 — GET /api/formateur/alertes?statut&formationId. */
export async function getAlertes(
  filtre: { statut?: StatutAlerte; formationId?: string } = {},
): Promise<AlerteDecrochage[]> {
  const params = new URLSearchParams();
  if (filtre.statut) params.set('statut', filtre.statut);
  if (filtre.formationId) params.set('formationId', filtre.formationId);
  const qs = params.toString();
  const response = await apiFetch(`/api/formateur/alertes${qs ? `?${qs}` : ''}`);
  return lireReponseFormation<AlerteDecrochage[]>(response, 'Impossible de charger les alertes.');
}

/** US-SUIVI-02 — GET /api/formateur/alertes/compteur (badge). */
export async function getCompteurAlertes(): Promise<{ ouvertes: number }> {
  const response = await apiFetch('/api/formateur/alertes/compteur');
  return lireReponseFormation<{ ouvertes: number }>(response, 'Impossible de compter les alertes.');
}

// ---------------------------------------------------------------------------
// IA — Prédiction des apprenants à risque (service ml, suggestion seulement)
// ---------------------------------------------------------------------------

/** Niveau suggéré par le modèle (jamais affiché par la couleur seule). */
export type NiveauRisque = 'FAIBLE' | 'MOYEN' | 'ELEVE';

export interface LigneRisque {
  inscriptionId: string;
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
  /** null : prédiction indisponible pour cet apprenant. */
  risque: { niveau: NiveauRisque; raisons: string[]; dateCalcul: string; versionModele: string } | null;
  /** Alertes ouvertes des règles existantes (complémentarité). */
  alertesOuvertes: string[];
}

export interface RisqueFormation {
  formation: { id: string; titre: string };
  disponible: boolean;
  dateCalcul: string | null;
  versionModele: string | null;
  rappel: string;
  apprenants: LigneRisque[];
}

export interface ResumeRisqueFormation {
  formation: { id: string; titre: string; statut: string };
  inscrits: number;
  eleve: number;
  moyen: number;
  faible: number;
  sansPrediction: number;
  alertesOuvertes: number;
  disponible: boolean;
  dateCalcul: string | null;
}

/** GET /api/formateur/risque/formations — formateur : ses formations ; administrateur : toutes. */
export async function getResumeRisque(): Promise<ResumeRisqueFormation[]> {
  const response = await apiFetch('/api/formateur/risque/formations');
  return lireReponseFormation<ResumeRisqueFormation[]>(
    response,
    'Impossible de charger la prédiction du risque.',
  );
}

/** GET /api/formateur/formations/:id/risque — apprenants d'une formation et leur niveau suggéré. */
export async function getRisqueFormation(formationId: string): Promise<RisqueFormation> {
  const response = await apiFetch(`/api/formateur/formations/${formationId}/risque`);
  return lireReponseFormation<RisqueFormation>(
    response,
    'Impossible de charger la prédiction du risque.',
  );
}

// ---------------------------------------------------------------------------
// US-SUIVI-03 — Traiter une alerte (action, réouverture, historique).
// ---------------------------------------------------------------------------

export interface AlerteDetail extends AlerteDecrochage {
  historique: Array<{
    id: string;
    type: 'TRAITEMENT' | 'REOUVERTURE';
    commentaire: string;
    date: string;
    auteur: { id: string; prenom: string | null; nom: string | null; email: string } | null;
  }>;
}

/** US-SUIVI-03 — GET /api/formateur/alertes/:id (alerte + historique). */
export async function getAlerte(alerteId: string): Promise<AlerteDetail> {
  const response = await apiFetch(`/api/formateur/alertes/${alerteId}`);
  return lireReponseFormation<AlerteDetail>(response, 'Impossible de charger l’alerte.');
}

/** US-SUIVI-03 — POST /api/formateur/alertes/:id/traiter { action } (409 si déjà traitée). */
export async function traiterAlerte(alerteId: string, action: string): Promise<AlerteDetail> {
  const response = await apiFetch(`/api/formateur/alertes/${alerteId}/traiter`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action }),
  });
  return lireReponseFormation<AlerteDetail>(response, 'Impossible de traiter l’alerte.');
}

/** US-SUIVI-03 — POST /api/formateur/alertes/:id/rouvrir { motif }. */
export async function rouvrirAlerte(alerteId: string, motif: string): Promise<AlerteDetail> {
  const response = await apiFetch(`/api/formateur/alertes/${alerteId}/rouvrir`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ motif }),
  });
  return lireReponseFormation<AlerteDetail>(response, 'Impossible de rouvrir l’alerte.');
}

// ---------------------------------------------------------------------------
// US-RPT-01 — Rapports de session exportés (CSV / PDF, génération asynchrone).
// ---------------------------------------------------------------------------

export type FormatRapport = 'CSV' | 'PDF';
export type PorteeRapport = 'GLOBAL' | 'INDIVIDUEL' | 'MODULE';
export type StatutRapport = 'EN_ATTENTE' | 'EN_COURS' | 'PRET' | 'ECHEC';

export interface Rapport {
  id: string;
  type: 'SESSION' | 'INSTITUTIONNEL';
  format: FormatRapport;
  statut: StatutRapport;
  parametres: { portee?: PorteeRapport; apprenantId?: string; moduleId?: string } & Record<
    string,
    unknown
  >;
  formation: { id: string; titre: string } | null;
  nomFichier: string | null;
  tailleOctets: number | null;
  empreinteSha256: string | null;
  derniereErreur: string | null;
  dateDemande: string;
  dateFin: string | null;
}

/** US-RPT-01 — POST /api/formateur/formations/:id/rapports (202 ; 429 au-delà de 5 / min). */
export async function demanderRapportSession(
  formationId: string,
  demande: { format: FormatRapport; portee: PorteeRapport; apprenantId?: string; moduleId?: string },
): Promise<Rapport> {
  const response = await apiFetch(`/api/formateur/formations/${formationId}/rapports`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(demande),
  });
  return lireReponseFormation<Rapport>(response, 'Impossible de demander le rapport.');
}

/** US-RPT-01 — GET /api/rapports?formationId (mes rapports, 50 plus récents). */
export async function getMesRapports(formationId?: string): Promise<Rapport[]> {
  const qs = formationId ? `?formationId=${encodeURIComponent(formationId)}` : '';
  const response = await apiFetch(`/api/rapports${qs}`);
  return lireReponseFormation<Rapport[]>(response, 'Impossible de charger vos rapports.');
}

/** US-RPT-01 — GET /api/rapports/:id/fichier (demandeur seul ; 409 si pas prêt). */
export async function telechargerRapport(rapport: Rapport): Promise<void> {
  const response = await apiFetch(`/api/rapports/${rapport.id}/fichier`);
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de télécharger le rapport.');
  }
  const url = URL.createObjectURL(await response.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = rapport.nomFichier ?? `rapport.${rapport.format.toLowerCase()}`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// US-RPT-02 — Rapports institutionnels (administrateur, période).
// ---------------------------------------------------------------------------

export type ModeleInstitutionnel = 'SYNTHESE' | 'FORMATIONS' | 'CERTIFICATS';

/** US-RPT-02 — POST /api/admin/rapports (202 ; 400 période invalide ; 429). */
export async function demanderRapportInstitutionnel(demande: {
  modele: ModeleInstitutionnel;
  format: FormatRapport;
  du?: string;
  au?: string;
}): Promise<Rapport> {
  const response = await apiFetch('/api/admin/rapports', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(demande),
  });
  return lireReponseFormation<Rapport>(response, 'Impossible de demander le rapport.');
}

// ---------------------------------------------------------------------------
// US-FORM-02 — Clôturer / archiver / rouvrir une formation (administrateur).
// ---------------------------------------------------------------------------

export interface ImpactCycleFormation {
  statut: StatutFormation;
  transitionsPossibles: StatutFormation[];
  inscriptionsEnCours: number;
  evaluationsEnCours: {
    tentativesEnCours: number;
    livrablesACorriger: number;
    correctionsEnCours: number;
    certificatsEnEmission: number;
  };
  certificatsActifs: number;
}

/** US-FORM-02 — GET /api/admin/formations/:id/cycle (impact avant changement). */
export async function getImpactCycleFormation(id: string): Promise<ImpactCycleFormation> {
  const response = await apiFetch(`/api/admin/formations/${id}/cycle`);
  return lireReponseFormation<ImpactCycleFormation>(response, 'Impossible de charger l’impact.');
}

/**
 * US-FORM-02 — POST /api/admin/formations/:id/statut { statut, confirmer }.
 * 409 CONFIRMATION_REQUISE si des évaluations sont en cours et `confirmer` absent.
 */
export async function changerStatutFormation(
  id: string,
  statut: StatutFormation,
  confirmer: boolean,
): Promise<FormationVue> {
  const response = await apiFetch(`/api/admin/formations/${id}/statut`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ statut, confirmer }),
  });
  return lireReponseFormation<FormationVue>(response, 'Impossible de changer le statut.');
}

// ---------------------------------------------------------------------------
// US-INSC-02 — Gérer les inscriptions d'une formation (administrateur).
// ---------------------------------------------------------------------------

export interface InscriptionAdmin {
  id: string;
  statut: 'EN_COURS' | 'TERMINEE' | 'SUSPENDUE';
  dateInscription: string;
  tauxAvancement: number;
  motifSuspension: string | null;
  dateSuspension: string | null;
  apprenant: { id: string; email: string; prenom: string | null; nom: string | null };
}

export interface RapportImportInscriptions {
  total: number;
  bilan: Record<string, number>;
  lignes: Array<{ ligne: number; email: string; resultat: string; libelle: string }>;
}

/** US-INSC-02 — GET /api/admin/formations/:id/inscriptions?statut */
export async function getInscriptionsFormation(
  formationId: string,
  statut?: InscriptionAdmin['statut'],
): Promise<InscriptionAdmin[]> {
  const qs = statut ? `?statut=${statut}` : '';
  const response = await apiFetch(`/api/admin/formations/${formationId}/inscriptions${qs}`);
  return lireReponseFormation<InscriptionAdmin[]>(response, 'Impossible de charger les inscriptions.');
}

/** US-INSC-02 — POST /api/admin/formations/:id/inscriptions { email } */
export async function inscrireApprenant(formationId: string, email: string): Promise<InscriptionAdmin> {
  const response = await apiFetch(`/api/admin/formations/${formationId}/inscriptions`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
  return lireReponseFormation<InscriptionAdmin>(response, 'Impossible d’inscrire cet apprenant.');
}

/** US-INSC-02 — POST /api/admin/inscriptions/:id/suspendre { motif } */
export async function suspendreInscription(id: string, motif: string): Promise<InscriptionAdmin> {
  const response = await apiFetch(`/api/admin/inscriptions/${id}/suspendre`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ motif }),
  });
  return lireReponseFormation<InscriptionAdmin>(response, 'Impossible de suspendre l’inscription.');
}

/** US-INSC-02 — POST /api/admin/inscriptions/:id/reactiver */
export async function reactiverInscription(id: string): Promise<InscriptionAdmin> {
  const response = await apiFetch(`/api/admin/inscriptions/${id}/reactiver`, { method: 'POST' });
  return lireReponseFormation<InscriptionAdmin>(response, 'Impossible de réactiver l’inscription.');
}

/** US-INSC-02 — POST /api/admin/formations/:id/inscriptions/import (multipart, champ « fichier »). */
export async function importerInscriptions(
  formationId: string,
  fichier: File,
): Promise<RapportImportInscriptions> {
  const corps = new FormData();
  corps.append('fichier', fichier);
  const response = await apiFetch(`/api/admin/formations/${formationId}/inscriptions/import`, {
    method: 'POST',
    body: corps,
  });
  return lireReponseFormation<RapportImportInscriptions>(response, 'Impossible d’importer le fichier.');
}

// ---------------------------------------------------------------------------
// US-INSC-03 — Se désinscrire (apprenant).
// ---------------------------------------------------------------------------

export interface ConsequencesDesinscription {
  formation: { id: string; titre: string };
  statut: string;
  possible: boolean;
  tauxAvancement: number;
  tentativesEnCours: number;
  livrablesEnAttente: number;
  certificatsConserves: number;
  consequences: string[];
}

/** US-INSC-03 — GET /api/formations/:id/desinscription (conséquences avant confirmation). */
export async function getConsequencesDesinscription(
  formationId: string,
): Promise<ConsequencesDesinscription> {
  const response = await apiFetch(`/api/formations/${formationId}/desinscription`);
  return lireReponseFormation<ConsequencesDesinscription>(
    response,
    'Impossible de charger les conséquences.',
  );
}

/** US-INSC-03 — POST /api/formations/:id/desinscription { confirmer: true } */
export async function seDesinscrire(formationId: string): Promise<void> {
  const response = await apiFetch(`/api/formations/${formationId}/desinscription`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ confirmer: true }),
  });
  await lireReponseFormation<unknown>(response, 'Impossible de vous désinscrire.');
}

// ---------------------------------------------------------------------------
// US-FORM-04 — Contenu pédagogique géré par le formateur affecté.
// ---------------------------------------------------------------------------

const baseContenu = (formationId: string): string => `/api/formateur/formations/${formationId}`;

/** US-FORM-04 — PATCH contenu (description, objectifs, prérequis ; null vide le champ). */
export async function modifierContenuFormation(
  formationId: string,
  contenu: { description?: string | null; objectifs?: string | null; prerequis?: string | null },
): Promise<FormationVue> {
  const response = await apiFetch(`${baseContenu(formationId)}/contenu`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(contenu),
  });
  return lireReponseFormation<FormationVue>(response, 'Impossible d’enregistrer le contenu.');
}

/** US-FORM-04 — POST module (ajouté en fin). */
export async function ajouterModuleFormateur(formationId: string, titre: string): Promise<ModuleVue> {
  const response = await apiFetch(`${baseContenu(formationId)}/modules`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ titre }),
  });
  return lireReponseFormation<ModuleVue>(response, 'Impossible d’ajouter le module.');
}

/** US-FORM-04 — PATCH module (titre). */
export async function renommerModuleFormateur(
  formationId: string,
  moduleId: string,
  titre: string,
): Promise<ModuleVue> {
  const response = await apiFetch(`${baseContenu(formationId)}/modules/${moduleId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ titre }),
  });
  return lireReponseFormation<ModuleVue>(response, 'Impossible de renommer le module.');
}

/** US-FORM-04 — PUT ordre (liste complète des modules). */
export async function reordonnerModulesFormateur(
  formationId: string,
  moduleIds: string[],
): Promise<ModuleVue[]> {
  const response = await apiFetch(`${baseContenu(formationId)}/modules/ordre`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ moduleIds }),
  });
  return lireReponseFormation<ModuleVue[]>(response, 'Impossible de réordonner les modules.');
}

/** US-FORM-04 — DELETE module (409 s'il porte une évaluation ou une ressource). */
export async function supprimerModuleFormateur(formationId: string, moduleId: string): Promise<void> {
  const response = await apiFetch(`${baseContenu(formationId)}/modules/${moduleId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de supprimer le module.');
  }
}

// ===================================================================
//  US-QCM-02 — Banque de questions du formateur
// ===================================================================

/** Une question de ma banque (questions de mes QCM, hors QCM courant). */
export interface QuestionBanque {
  id: string;
  enonce: string;
  type: QuestionQcm['type'];
  ponderation: number;
  explication: string | null;
  niveauDifficulte: string | null;
  origine: string;
  qcms: Array<{ id: string; titre: string }>;
  figee: boolean;
  options: Array<{ texte: string; estCorrecte: boolean; ordre: number }>;
}

export interface Banque {
  questions: QuestionBanque[];
  message: string | null;
}

/** GET /api/qcm/:id/banque?recherche — ma banque, hors questions du QCM. */
export async function getBanque(qcmId: string, recherche: string): Promise<Banque> {
  const params = recherche.trim() ? `?recherche=${encodeURIComponent(recherche.trim())}` : '';
  const response = await apiFetch(`/api/qcm/${qcmId}/banque${params}`);
  return lireReponseFormation<Banque>(response, 'Impossible de charger la banque de questions.');
}

/** POST /api/qcm/:id/banque/import — lie les questions choisies (sans copie). */
export async function importerDeLaBanque(
  qcmId: string,
  questionIds: string[],
): Promise<QcmDetail> {
  const response = await apiFetch(`/api/qcm/${qcmId}/banque/import`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ questionIds }),
  });
  return lireReponseFormation<QcmDetail>(response, 'Impossible d’importer les questions.');
}

// ===================================================================
//  US-QCM-11 — Historique des tentatives
// ===================================================================

/** Une ligne de l'historique (apprenant ou formateur). */
export interface LigneHistorique {
  id: string;
  qcmId: string;
  qcmTitre: string;
  formationId: string;
  formationTitre: string;
  numero: number;
  statut: StatutTentative;
  dateDebut: string;
  dateFin: string | null;
  dureeSecondes: number | null;
  score: number | null;
  estReussie: boolean | null;
  nbQuestions: number;
  nbRepondues: number;
}

export interface LigneHistoriqueFormateur extends LigneHistorique {
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
}

/** Détail apprenant : questions vues et options cochées, sans corrigé. */
export interface DetailHistoriqueApprenant extends LigneHistorique {
  questions: Array<{
    id: string;
    enonce: string;
    type: TypeQuestion;
    options: Array<{ id: string; texte: string }>;
  }>;
  reponses: Record<string, string[]>;
  correction: EtatCorrection;
}

/** Détail formateur : corrigé complet. */
export interface DetailHistoriqueFormateur extends LigneHistoriqueFormateur {
  questions: QuestionCorrigee[];
}

/** GET /api/mes-tentatives — mon historique, les plus récentes d'abord. */
export async function getMesTentatives(): Promise<LigneHistorique[]> {
  const response = await apiFetch('/api/mes-tentatives');
  return lireReponseFormation<LigneHistorique[]>(response, 'Impossible de charger vos tentatives.');
}

/** GET /api/mes-tentatives/:id — détail d'une de mes tentatives. */
export async function getMaTentative(tentativeId: string): Promise<DetailHistoriqueApprenant> {
  const response = await apiFetch(`/api/mes-tentatives/${tentativeId}`);
  return lireReponseFormation<DetailHistoriqueApprenant>(
    response,
    'Impossible de charger cette tentative.',
  );
}

/** GET /api/formateur/qcm/:qcmId/tentatives — tentatives de mon QCM. */
export async function getTentativesQcm(qcmId: string): Promise<LigneHistoriqueFormateur[]> {
  const response = await apiFetch(`/api/formateur/qcm/${qcmId}/tentatives`);
  return lireReponseFormation<LigneHistoriqueFormateur[]>(
    response,
    'Impossible de charger les tentatives.',
  );
}

/** GET /api/formateur/qcm/:qcmId/tentatives/:id — détail avec corrigé. */
export async function getTentativeFormateur(
  qcmId: string,
  tentativeId: string,
): Promise<DetailHistoriqueFormateur> {
  const response = await apiFetch(`/api/formateur/qcm/${qcmId}/tentatives/${tentativeId}`);
  return lireReponseFormation<DetailHistoriqueFormateur>(
    response,
    'Impossible de charger cette tentative.',
  );
}

// ===================================================================
//  US-QCM-13 — Rapport PDF détaillé d'une tentative notée
// ===================================================================

/** Nom de fichier lu dans `Content-Disposition` (sinon celui par défaut). */
function nomFichierReponse(response: Response, parDefaut: string): string {
  const entete = response.headers.get('Content-Disposition') ?? '';
  const trouve = /filename="([^"]+)"/.exec(entete);
  return trouve ? trouve[1] : parDefaut;
}

/**
 * US-QCM-13 — télécharge le rapport PDF d'une tentative notée (jeton requis :
 * je le récupère avec apiFetch puis le propose au navigateur).
 *   - sans `qcmId` : GET /api/tentatives/:id/rapport.pdf (apprenant, sa tentative) ;
 *   - avec `qcmId` : GET /api/formateur/qcm/:qcmId/tentatives/:id/rapport.pdf
 *     (formateur affecté ou administrateur, corrigé toujours inclus).
 *   - 409 -> tentative pas encore notée ; 404 / 403 -> message exact du serveur.
 */
export async function telechargerRapportTentative(
  tentativeId: string,
  qcmId?: string,
): Promise<void> {
  const chemin = qcmId
    ? `/api/formateur/qcm/${qcmId}/tentatives/${tentativeId}/rapport.pdf`
    : `/api/tentatives/${tentativeId}/rapport.pdf`;
  const response = await apiFetch(chemin);
  if (!response.ok) {
    await lireReponseFormation<never>(response, 'Impossible de télécharger le rapport.');
  }
  const nom = nomFichierReponse(response, 'rapport-tentative.pdf');
  const url = URL.createObjectURL(await response.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===================================================================
//  US-IA-05 — Traçabilité des générations IA (administrateur)
// ===================================================================

export interface PersonneTracee {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
}

export interface GenerationTracee {
  id: string;
  statut: 'EN_COURS' | 'TERMINEE' | 'ECHEC';
  dateLancement: string;
  dateFin: string | null;
  modeleLlm: string | null;
  parametres: {
    nbQuestionsDemandees: number;
    types: string[];
    niveau: string;
    focusThematique: string | null;
  };
  nbSuggestions: number | null;
  nbInvalides: number | null;
  nbTentatives: number;
  derniereErreur: string | null;
  formateur: PersonneTracee | null;
  formation: { id: string; titre: string };
  module: { id: string; titre: string };
  support: { id: string; titre: string };
  decisions: { proposees: number; acceptees: number; modifiees: number; rejetees: number };
}

export interface SuggestionTracee {
  id: string;
  ordre: number;
  enonce: string;
  type: string;
  statut: 'PROPOSEE' | 'ACCEPTEE' | 'MODIFIEE' | 'REJETEE';
  scoreConfiance: number | null;
  decidePar: PersonneTracee | null;
  dateDecision: string | null;
  motifRejet: string | null;
  question: { id: string; origine: string } | null;
  qcm: { id: string; titre: string } | null;
}

export interface DetailGenerationTracee extends GenerationTracee {
  suggestions: SuggestionTracee[];
  historique: Array<{
    horodatage: string;
    action: string;
    acteur: PersonneTracee | null;
    cible: string;
    resultat: string;
  }>;
}

export interface FiltreGenerationsIa {
  statut?: string;
  du?: string;
  au?: string;
  page?: number;
}

/** GET /api/admin/generations-ia — registre paginé. */
export async function getGenerationsIa(
  filtre: FiltreGenerationsIa,
): Promise<{ total: number; page: number; limite: number; generations: GenerationTracee[] }> {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtre)) {
    if (valeur !== undefined && valeur !== '') params.set(cle, String(valeur));
  }
  const suffixe = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(`/api/admin/generations-ia${suffixe}`);
  return lireReponseFormation(response, 'Impossible de charger les générations IA.');
}

/** GET /api/admin/generations-ia/:id — détail, décisions et historique. */
export async function getGenerationIa(id: string): Promise<DetailGenerationTracee> {
  const response = await apiFetch(`/api/admin/generations-ia/${id}`);
  return lireReponseFormation<DetailGenerationTracee>(
    response,
    'Impossible de charger cette génération.',
  );
}

// ===================================================================
//  US-IA-07 — Suivi en temps réel (SSE) de l'indexation et de la génération
// ===================================================================

/** Un état reçu en direct (même contenu que la fiche REST, en liste blanche). */
export interface EtatSuivi {
  nature: 'support' | 'generation';
  id: string;
  statut: string;
  nbTentatives: number;
  derniereErreur: string | null;
  resultat: number | null;
  final: boolean;
}

/**
 * Ouvre le flux SSE `chemin` (avec le jeton, via fetch : EventSource ne sait
 * pas envoyer d'en-tête) et appelle `surEtat` à chaque événement « etat ».
 * Se termine à la fermeture du flux (état final, durée maximale, coupure) ou
 * quand `signal` est annulé. Le fichier appelant garde l'API REST en repli.
 */
export async function suivreEnDirect(
  chemin: string,
  surEtat: (etat: EtatSuivi) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await apiFetch(chemin, { headers: { Accept: 'text/event-stream' }, signal });
  if (!response.ok || !response.body) return;
  const lecteur = response.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) return;
    tampon += decodeur.decode(value, { stream: true });
    let fin = tampon.indexOf('\n\n');
    while (fin >= 0) {
      const bloc = tampon.slice(0, fin);
      tampon = tampon.slice(fin + 2);
      const donnees = bloc
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (donnees) {
        try {
          surEtat(JSON.parse(donnees) as EtatSuivi);
        } catch {
          // Bloc incomplet ou illisible : ignoré, le repli REST rattrapera.
        }
      }
      fin = tampon.indexOf('\n\n');
    }
  }
}

/* ============================================================
 * US-AUTH-08 — Changer son mot de passe (utilisateur connecté)
 * ============================================================ */
export class ChangementMotDePasseError extends Error {}

/**
 * POST /api/auth/change-password. Un 401 « mot de passe actuel incorrect »
 * (code MOT_DE_PASSE_ACTUEL_INCORRECT) est une erreur MÉTIER : il ne doit pas
 * déclencher le refresh puis la déconnexion d'apiFetch. On envoie donc d'abord
 * avec le jeton courant ; seul un autre 401 (jeton expiré) passe par apiFetch,
 * qui rafraîchit la session et rejoue la requête.
 */
export async function changerMotDePasse(
  motDePasseActuel: string,
  nouveauMotDePasse: string,
): Promise<{ message: string; sessionsRevoquees: number }> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasseActuel, nouveauMotDePasse }),
  };
  let response = await fetchWithAuth('/api/auth/change-password', init);
  let data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
    sessionsRevoquees?: number;
  };
  if (response.status === 401 && data.code !== 'MOT_DE_PASSE_ACTUEL_INCORRECT') {
    response = await apiFetch('/api/auth/change-password', init);
    data = (await response.json().catch(() => ({}))) as typeof data;
  }
  if (!response.ok) {
    throw new ChangementMotDePasseError(
      messageErreur(data) ?? 'Impossible de changer le mot de passe.',
    );
  }
  return {
    message: messageErreur(data) ?? 'Mot de passe modifié.',
    sessionsRevoquees: data.sessionsRevoquees ?? 0,
  };
}

/* ============================================================
 * US-AUTH-06 — Mot de passe oublié (routes publiques)
 * ============================================================ */
export class MotDePasseOublieError extends Error {}

/** POST /api/auth/forgot-password — réponse neutre, identique dans tous les cas. */
export async function demanderReinitialisation(email: string): Promise<string> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    throw new MotDePasseOublieError(
      messageErreur(data) ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return messageErreur(data) ?? '';
}

/** POST /api/auth/reset-password — jeton du lien + nouveau mot de passe. */
export async function reinitialiserMotDePasse(
  token: string,
  nouveauMotDePasse: string,
): Promise<string> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, nouveauMotDePasse }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    throw new MotDePasseOublieError(
      messageErreur(data) ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return messageErreur(data) ?? '';
}

// ---------------------------------------------------------------------------
// US-CPT-02 — Import CSV de comptes (ADMINISTRATEUR) et activation.
// ---------------------------------------------------------------------------

export interface CompteImporte {
  ligne: number;
  id: string;
  email: string;
  role: RoleUtilisateur;
}

export interface ErreurLigneImport {
  ligne: number;
  email: string;
  erreurs: string[];
  libelles: string[];
}

export type ResultatImportComptes =
  | { ok: true; crees: number; comptes: CompteImporte[] }
  | { ok: false; message: string; lignesAnalysees: number; erreurs: ErreurLigneImport[] };

/**
 * POST /api/admin/users/import — tout ou rien. Un refus (400) qui porte un
 * rapport ligne par ligne est un résultat, pas une exception ; les autres
 * erreurs (fichier inexploitable, 413, 409, 403…) lèvent AdminError.
 */
export async function importerComptes(fichier: File): Promise<ResultatImportComptes> {
  const corps = new FormData();
  corps.append('fichier', fichier);
  const response = await apiFetch('/api/admin/users/import', { method: 'POST', body: corps });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    crees?: number;
    comptes?: CompteImporte[];
    lignesAnalysees?: number;
    erreurs?: ErreurLigneImport[];
  };
  if (response.ok) {
    return { ok: true, crees: data.crees ?? 0, comptes: data.comptes ?? [] };
  }
  if (response.status === 400 && Array.isArray(data.erreurs)) {
    return {
      ok: false,
      message: messageErreur(data) ?? 'Import refusé.',
      lignesAnalysees: data.lignesAnalysees ?? 0,
      erreurs: data.erreurs,
    };
  }
  throw new AdminError(messageErreur(data) ?? 'Impossible d’importer le fichier.', response.status);
}

/** POST /api/admin/users/:id/activation — renvoie l'email d'activation. */
export async function renvoyerActivation(userId: string): Promise<string> {
  const response = await apiFetch(`/api/admin/users/${userId}/activation`, { method: 'POST' });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    throw new AdminError(messageErreur(data) ?? 'Impossible de renvoyer l’email.', response.status);
  }
  return messageErreur(data) ?? 'Email d’activation renvoyé.';
}

/** POST /api/auth/activate — activation d'un compte importé (route publique). */
export async function activerCompte(token: string, nouveauMotDePasse: string): Promise<string> {
  const response = await fetch('/api/auth/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, nouveauMotDePasse }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    throw new MotDePasseOublieError(
      messageErreur(data) ?? 'Une erreur est survenue. Veuillez réessayer.',
    );
  }
  return messageErreur(data) ?? '';
}

// ---------------------------------------------------------------------------
// US-CPT-04 — Anonymisation RGPD d'un compte (ADMINISTRATEUR).
// ---------------------------------------------------------------------------

/** POST /api/admin/users/:id/anonymiser — irréversible, double confirmation. */
export async function anonymiserCompte(
  userId: string,
  motDePasseAdmin: string,
  confirmation: string,
): Promise<{ id: string; statut: string; nom: string }> {
  const response = await apiFetch(`/api/admin/users/${userId}/anonymiser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasseAdmin, confirmation }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    id?: string;
    statut?: string;
    nom?: string;
  };
  if (!response.ok) {
    throw new AdminError(messageErreur(data) ?? 'Impossible d’anonymiser ce compte.', response.status);
  }
  return { id: data.id ?? userId, statut: data.statut ?? 'ANONYMISE', nom: data.nom ?? '' };
}

// ---------------------------------------------------------------------------
// US-QCM-12 — Surveillance webcam par captures.
// ---------------------------------------------------------------------------

/** POST /api/qcm/:id/surveillance/refus — refus ou caméra absente (journalisé). */
export async function refuserSurveillance(
  qcmId: string,
  motif: 'REFUS' | 'CAMERA_INDISPONIBLE',
): Promise<string> {
  const response = await apiFetch(`/api/qcm/${qcmId}/surveillance/refus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motif }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  return (
    messageErreur(data) ??
    'Sans caméra, demandez à votre formateur un passage surveillé en présentiel.'
  );
}

/** POST /api/tentatives/:id/captures — dépôt d'une capture (image JPEG). */
export async function deposerCapture(tentativeId: string, image: Blob): Promise<boolean> {
  const corps = new FormData();
  corps.append('capture', image, 'capture.jpg');
  const response = await apiFetch(`/api/tentatives/${tentativeId}/captures`, {
    method: 'POST',
    body: corps,
  });
  return response.ok;
}

export interface CapturesTentative {
  tentativeId: string;
  consentementLe: string | null;
  conservationJours: number;
  captures: Array<{ id: string; priseLe: string; tailleOctets: number }>;
}

/** GET /api/tentatives/:id/captures — formateur affecté ou administrateur. */
export async function getCapturesTentative(tentativeId: string): Promise<CapturesTentative> {
  const response = await apiFetch(`/api/tentatives/${tentativeId}/captures`);
  const data = (await response.json().catch(() => ({}))) as CapturesTentative & {
    message?: string | string[];
  };
  if (!response.ok) {
    throw new AdminError(messageErreur(data) ?? 'Impossible de charger les captures.', response.status);
  }
  return data;
}

/** POST /api/captures/:id/lien — lien signé (2 min) vers l'image. */
export async function lienCapture(captureId: string): Promise<string> {
  const response = await apiFetch(`/api/captures/${captureId}/lien`, { method: 'POST' });
  const data = (await response.json().catch(() => ({}))) as { url?: string; message?: string | string[] };
  if (!response.ok || !data.url) {
    throw new AdminError(messageErreur(data) ?? 'Impossible d’ouvrir la capture.', response.status);
  }
  return data.url;
}

// ---------------------------------------------------------------------------
// US-FORM-07 — Demandes d'affectation (un formateur demande une formation).
// ---------------------------------------------------------------------------

export type StatutDemandeAffectation = 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE' | 'ANNULEE';

export interface DemandeAffectation {
  id: string;
  formation: { id: string; titre: string; statut: StatutFormation };
  motif: string;
  statut: StatutDemandeAffectation;
  motifRefus: string | null;
  traiteLe: string | null;
  creeLe: string;
}

export interface DemandeAffectationAdmin extends DemandeAffectation {
  formateur: { id: string; email: string; prenom: string | null; nom: string | null };
  traitePar: string | null;
}

export interface FormationDisponible {
  id: string;
  titre: string;
  statut: StatutFormation;
  dateDebut: string | null;
  dateFin: string | null;
  demandeEnAttente: boolean;
}

/** GET /api/formateur/demandes-affectation — mes demandes. */
export async function getMesDemandesAffectation(): Promise<DemandeAffectation[]> {
  const response = await apiFetch('/api/formateur/demandes-affectation');
  return lireReponseFormation<DemandeAffectation[]>(response, 'Impossible de charger vos demandes.');
}

/** GET /api/formateur/demandes-affectation/formations-disponibles. */
export async function getFormationsDisponibles(): Promise<FormationDisponible[]> {
  const response = await apiFetch('/api/formateur/demandes-affectation/formations-disponibles');
  return lireReponseFormation<FormationDisponible[]>(response, 'Impossible de charger les formations.');
}

/** POST /api/formateur/demandes-affectation — 400 motif / archivée, 409 déjà affecté ou en attente. */
export async function creerDemandeAffectation(
  formationId: string,
  motif: string,
): Promise<DemandeAffectation> {
  const response = await apiFetch('/api/formateur/demandes-affectation', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ formationId, motif }),
  });
  return lireReponseFormation<DemandeAffectation>(response, 'Impossible d’envoyer la demande.');
}

/** PATCH /api/formateur/demandes-affectation/:id/annuler. */
export async function annulerDemandeAffectation(id: string): Promise<DemandeAffectation> {
  const response = await apiFetch(`/api/formateur/demandes-affectation/${id}/annuler`, {
    method: 'PATCH',
  });
  return lireReponseFormation<DemandeAffectation>(response, 'Impossible d’annuler la demande.');
}

/** GET /api/admin/demandes-affectation?statut&page&limit. */
export async function getAdminDemandesAffectation(
  query: { statut?: StatutDemandeAffectation; page?: number; limit?: number } = {},
): Promise<{ items: DemandeAffectationAdmin[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (query.statut) params.set('statut', query.statut);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  const response = await apiFetch(`/api/admin/demandes-affectation${qs ? `?${qs}` : ''}`);
  return lireReponseFormation(response, 'Impossible de charger les demandes.');
}

/** PATCH /api/admin/demandes-affectation/:id/accepter — crée l'affectation. */
export async function accepterDemandeAffectation(id: string): Promise<DemandeAffectationAdmin> {
  const response = await apiFetch(`/api/admin/demandes-affectation/${id}/accepter`, {
    method: 'PATCH',
  });
  return lireReponseFormation<DemandeAffectationAdmin>(response, 'Impossible d’accepter la demande.');
}

/** PATCH /api/admin/demandes-affectation/:id/refuser — motif obligatoire (10–1000). */
export async function refuserDemandeAffectation(
  id: string,
  motif: string,
): Promise<DemandeAffectationAdmin> {
  const response = await apiFetch(`/api/admin/demandes-affectation/${id}/refuser`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ motif }),
  });
  return lireReponseFormation<DemandeAffectationAdmin>(response, 'Impossible de refuser la demande.');
}

// ---------------------------------------------------------------------------
// US-FORM-08 — Propositions de nouvelles formations (formateur -> admin).
// ---------------------------------------------------------------------------

export type StatutProposition = 'EN_ATTENTE' | 'A_MODIFIER' | 'ACCEPTEE' | 'REFUSEE';

export interface PropositionFormation {
  id: string;
  titre: string;
  description: string | null;
  objectifs: string | null;
  dureeHeures: number | null;
  capaciteMax: number;
  publicVise: string | null;
  motif: string;
  statut: StatutProposition;
  commentaireAdmin: string | null;
  formationId: string | null;
  version: number;
  traiteLe: string | null;
  creeLe: string;
  modifieLe: string;
}

export interface PropositionFormationAdmin extends PropositionFormation {
  formateur: { id: string; email: string; prenom: string | null; nom: string | null };
  traitePar: string | null;
}

export interface PropositionFormationSaisie {
  titre: string;
  description?: string;
  objectifs?: string;
  dureeHeures?: number;
  capaciteMax: number;
  publicVise?: string;
  motif: string;
}

export async function getMesPropositions(): Promise<PropositionFormation[]> {
  const response = await apiFetch('/api/formateur/propositions-formation');
  return lireReponseFormation<PropositionFormation[]>(response, 'Impossible de charger vos propositions.');
}

/** POST (création) ou PUT /:id (modification et resoumission). */
export async function enregistrerProposition(
  saisie: PropositionFormationSaisie,
  id?: string,
): Promise<PropositionFormation> {
  const response = await apiFetch(`/api/formateur/propositions-formation${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(saisie),
  });
  return lireReponseFormation<PropositionFormation>(response, 'Impossible d’enregistrer la proposition.');
}

export async function getAdminPropositions(
  query: { statut?: StatutProposition; page?: number; limit?: number } = {},
): Promise<{ items: PropositionFormationAdmin[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (query.statut) params.set('statut', query.statut);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  const response = await apiFetch(`/api/admin/propositions-formation${qs ? `?${qs}` : ''}`);
  return lireReponseFormation(response, 'Impossible de charger les propositions.');
}

/** accepter | demander-modifications | refuser (commentaire 10–1000 sauf pour accepter). */
export async function deciderProposition(
  id: string,
  action: 'accepter' | 'demander-modifications' | 'refuser',
  commentaire?: string,
): Promise<PropositionFormationAdmin> {
  const response = await apiFetch(`/api/admin/propositions-formation/${id}/${action}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(commentaire === undefined ? {} : { commentaire }),
  });
  return lireReponseFormation<PropositionFormationAdmin>(response, 'Impossible d’enregistrer la décision.');
}

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
let refreshInFlight: Promise<string | null> | null = null;

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

  const newToken = await refreshSession();
  if (!newToken) {
    forceLogout();
    return response;
  }

  return fetchWithAuth(input, init);
}

/** Refresh single-flight : un seul appel réseau partagé. */
function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** POST /api/auth/refresh (le cookie part tout seul). */
async function doRefresh(): Promise<string | null> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    return null;
  }
  const session = (await response.json()) as LoginResponse;
  currentAccessToken = session.accessToken;
  if (onRefreshed) {
    onRefreshed(session);
  }
  return session.accessToken;
}

/** Session morte : on efface tout et on renvoie vers /login. */
function forceLogout(): void {
  currentAccessToken = null;
  if (onCleared) {
    onCleared();
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
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
    forceLogout();
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
 * backend a posé le cookie refresh (httpOnly) ; on échange ce cookie contre un
 * access token en mémoire via /api/auth/refresh. Retourne la session ou null.
 */
export async function bootstrapSession(): Promise<LoginResponse | null> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as LoginResponse;
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

/** Une entrée du journal telle que renvoyée par l'API (lecture seule). */
export interface AuditLogEntry {
  id: string;
  userId: string | null; // acteur
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
      response.status === 403
        ? 'Accès réservé aux administrateurs.'
        : "Impossible de charger le journal d'audit.",
      response.status,
    );
  }
  return (await response.json()) as AuditPage;
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
      response.status === 403
        ? 'Accès réservé aux administrateurs.'
        : "Impossible d'exporter le journal d'audit.",
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
export type StatutFormation = 'OUVERTE' | 'FERMEE' | 'ARCHIVEE';

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
  | 'session_active_ailleurs';

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
export async function demarrerTentative(qcmId: string): Promise<TentativeDemarree> {
  const response = await apiFetch(`/api/qcm/${qcmId}/tentatives`, { method: 'POST' });
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

export type StatutCertificat = 'EN_ATTENTE_GENERATION' | 'EN_GENERATION' | 'ACTIF' | 'REVOQUE';

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
  /** US-CERT-06 — null tant que le certificat n'est pas révoqué. */
  revocation: {
    date: string;
    motif: MotifRevocation;
    description: string;
    revoquePar: string;
  } | null;
}

/** Motif d'une révocation (US-CERT-06, DS-07). */
export type MotifRevocation = 'FRAUDE' | 'ERREUR_ADMIN' | 'DISCIPLINAIRE' | 'JUDICIAIRE';

/** GET /api/admin/certificats — plus récents d'abord, filtre facultatif. */
export async function getCertificatsAdmin(statut?: StatutCertificat): Promise<CertificatAdmin[]> {
  const response = await apiFetch(`/api/admin/certificats${statut ? `?statut=${statut}` : ''}`);
  return lireReponseFormation<CertificatAdmin[]>(response, 'Impossible de charger les certificats.');
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

export type VerdictCertificat = 'VALIDE' | 'REVOQUE' | 'INTEGRITE_COMPROMISE';

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

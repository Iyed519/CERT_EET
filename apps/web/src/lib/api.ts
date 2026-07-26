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

/**
 * POST /api/auth/login. credentials:'include' pour que le navigateur accepte
 * le cookie httpOnly (refresh token). Échec -> LoginError avec le message
 * générique du backend (opacité, DS-01).
 */
export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
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

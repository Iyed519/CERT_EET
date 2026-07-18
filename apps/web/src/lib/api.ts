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

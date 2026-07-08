/**
 * Client API minimal pour le frontend (US-AUTH-01).
 *
 * Premier fichier de ce type dans le projet : centralise les appels HTTP
 * vers le backend NestJS, pour que les composants n'écrivent jamais
 * fetch(...) directement (même logique que ConfigService côté backend :
 * un seul point de vérité, plus facile à faire évoluer plus tard).
 *
 * Pas d'URL de base ici : le frontend et l'API sont servis par le MÊME
 * reverse proxy Nginx (US-INFRA-03), donc un chemin relatif ("/api/...")
 * suffit — pas de CORS, pas de configuration d'environnement nécessaire.
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
 * Appelle POST /api/auth/login.
 *
 * credentials: 'include' est nécessaire pour que le navigateur envoie ET
 * accepte le cookie httpOnly contenant le refresh token (US-AUTH-01,
 * backend) — sans ça, le cookie posé par le serveur serait ignoré.
 *
 * En cas d'échec (401 identifiants invalides, 400 validation), on lève
 * une LoginError avec le message générique renvoyé par le backend —
 * jamais un message différent selon le cas (sécurité par opacité, DS-01).
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
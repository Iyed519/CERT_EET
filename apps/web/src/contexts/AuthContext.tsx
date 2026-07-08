'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';
import { LoginResponse } from '../lib/api';

/**
 * Contexte d'authentification (US-AUTH-01).
 *
 * Contient l'utilisateur connecté ET son access token, gardés UNIQUEMENT
 * en mémoire JavaScript (useState) — jamais dans localStorage ni
 * sessionStorage. C'est une exigence de sécurité explicite de DS-01 : un
 * access token en localStorage serait lisible par n'importe quel script
 * injecté sur la page (XSS). En mémoire, il disparaît à chaque
 * rafraîchissement de page — c'est un compromis voulu, pas un oubli.
 * (Le rafraîchissement automatique de session sans perdre l'utilisateur
 * sera couvert par US-AUTH-03, qui utilisera le refresh token en cookie
 * httpOnly pour obtenir un nouvel access token silencieusement.)
 *
 * 'use client' : ce fichier utilise useState/createContext, qui ne
 * fonctionnent que côté client dans Next.js App Router (INF02).
 */

interface AuthContextValue {
  accessToken: string | null;
  user: LoginResponse['user'] | null;
  setSession: (session: LoginResponse) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);

  function setSession(session: LoginResponse): void {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }

  function clearSession(): void {
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ accessToken, user, setSession, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook d'accès au contexte, avec garde-fou : lève une erreur claire si
 * utilisé hors d'un <AuthProvider> (erreur de développement, pas un cas
 * d'exécution normal) plutôt que de renvoyer silencieusement undefined.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error(`useAuth doit être utilisé à l'intérieur d'un AuthProvider.`);
  }
  return context;
}
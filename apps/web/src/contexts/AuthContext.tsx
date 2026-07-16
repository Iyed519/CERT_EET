'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  LoginResponse,
  registerSessionHandlers,
  setAccessToken,
} from '../lib/api';

/**
 * Contexte d'authentification (US-AUTH-01, US-AUTH-03).
 *
 * L'utilisateur et l'access token restent UNIQUEMENT en mémoire (useState),
 * jamais dans localStorage/sessionStorage (exigence anti-XSS, DS-01). Le token
 * est aussi recopié dans un miroir de module (lib/api) pour que l'intercepteur
 * 401 puisse l'utiliser hors du rendu React.
 */
interface AuthContextValue {
  accessToken: string | null;
  user: LoginResponse['user'] | null;
  setSession: (session: LoginResponse) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);

  function setSession(session: LoginResponse): void {
    setAccessTokenState(session.accessToken);
    setUser(session.user);
    setAccessToken(session.accessToken); // miroir module pour apiFetch
  }

  function clearSession(): void {
    setAccessTokenState(null);
    setUser(null);
    setAccessToken(null);
  }

  /**
   * US-AUTH-03 : on branche l'intercepteur d'api.ts sur l'état React. Un
   * refresh silencieux réussi (hors rendu) appelle onRefreshed pour restaurer
   * la session ; un échec appelle onCleared pour la vider. Enregistré une
   * seule fois au montage (les setters useState sont stables).
   */
  useEffect(() => {
    registerSessionHandlers({
      onRefreshed: (session) => {
        setAccessTokenState(session.accessToken);
        setUser(session.user);
        setAccessToken(session.accessToken);
      },
      onCleared: () => {
        setAccessTokenState(null);
        setUser(null);
        setAccessToken(null);
      },
    });
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, user, setSession, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook d'accès au contexte, avec garde-fou si utilisé hors <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error(`useAuth doit être utilisé à l'intérieur d'un AuthProvider.`);
  }
  return context;
}

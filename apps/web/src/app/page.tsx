'use client';
import { AccueilPublic } from '../components/accueil/AccueilPublic';
import { useAuth } from '../contexts/AuthContext';

/**
 * Page d'accueil publique (visiteur). US-NAV-01 : un utilisateur connecté n'y
 * reste pas — SessionPrete le redirige vers la page de son rôle
 * (`pageAccueilDuRole`) avant tout rendu.
 */
export default function HomePage(): JSX.Element | null {
  const { user } = useAuth();
  if (user) return null;
  return <AccueilPublic />;
}

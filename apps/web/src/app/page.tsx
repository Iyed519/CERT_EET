'use client';
import { AccueilAdmin } from '../components/accueil/AccueilAdmin';
import { AccueilApprenant } from '../components/accueil/AccueilApprenant';
import { AccueilFormateur } from '../components/accueil/AccueilFormateur';
import { AccueilPublic } from '../components/accueil/AccueilPublic';
import { useAuth } from '../contexts/AuthContext';

/**
 * Page d'accueil : présentation pour un visiteur, tableau de bord du rôle
 * pour un utilisateur connecté (la connexion y mène).
 */
export default function HomePage(): JSX.Element {
  const { user } = useAuth();
  if (!user) return <AccueilPublic />;
  if (user.role === 'ADMINISTRATEUR') return <AccueilAdmin email={user.email} />;
  if (user.role === 'FORMATEUR') return <AccueilFormateur email={user.email} />;
  return <AccueilApprenant email={user.email} />;
}

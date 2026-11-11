import { Role } from '../../database/enums/role.enum';

/**
 * US-NAV-01 — Page d'accueil de chaque rôle, pour les liens des emails.
 * Reprend À L'IDENTIQUE `PAGE_ACCUEIL_PAR_ROLE` du web
 * (`apps/web/src/components/navigation.ts`), source de la règle : un email
 * mène directement là où la connexion aurait mené (la page de connexion
 * ramène ensuite sur ce chemin, `?suite=`).
 */
export const PAGE_ACCUEIL_PAR_ROLE: Record<Role, string> = {
  [Role.ADMINISTRATEUR]: '/admin/tableau-de-bord',
  [Role.FORMATEUR]: '/formateur/formations',
  [Role.APPRENANT]: '/catalogue',
};

export function pageAccueilDuRole(role: Role): string {
  return PAGE_ACCUEIL_PAR_ROLE[role];
}

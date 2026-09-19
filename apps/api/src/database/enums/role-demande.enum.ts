/**
 * Rôles qu'un utilisateur peut DEMANDER via une demande de changement de rôle
 * (US-ROL-02). Volontairement restreint à une montée en privilège : on ne
 * demande jamais APPRENANT (rôle par défaut). C'est un enum DISTINCT de `Role`
 * (et non un sous-type) pour que le ValidationPipe rejette en 400, dès l'entrée,
 * toute autre valeur — y compris APPRENANT.
 */
export enum RoleDemande {
  FORMATEUR = 'FORMATEUR',
  ADMINISTRATEUR = 'ADMINISTRATEUR',
}

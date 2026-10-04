/**
 * Cycle de vie d'une tentative de QCM (énumération `StatutTentative`,
 * diagramme d'états-transitions ET-02).
 *
 * EN_COURS (timer serveur actif) -> SOUMISE (l'apprenant a soumis à temps) ou
 * ABANDONNEE_TIMER (temps écoulé, réponses partielles conservées) -> NOTEE
 * (score calculé côté serveur ; état terminal et immuable, il constitue
 * l'historique certifiant).
 */
export enum StatutTentative {
  EN_COURS = 'EN_COURS',
  SOUMISE = 'SOUMISE',
  ABANDONNEE_TIMER = 'ABANDONNEE_TIMER',
  NOTEE = 'NOTEE',
}

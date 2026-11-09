/**
 * Le CONTENU du support est en cause (PDF illisible ou protégé, archive
 * invalide, aucun texte exploitable…) : réessayer ne changera rien. Le worker
 * convertit cette erreur en échec définitif immédiat (statut
 * ECHEC_INDEXATION), avec ce message en français pour le formateur.
 */
export class ErreurExtraction extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurExtraction';
  }
}

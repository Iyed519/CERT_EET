/**
 * Origine d'une question de QCM (US-IA-04) : saisie par le formateur, ou issue
 * d'une suggestion de l'IA acceptée telle quelle ou modifiée avant
 * l'acceptation. Visible dans l'éditeur de QCM (transparence, US-IA-05).
 */
export enum OrigineQuestion {
  MANUELLE = 'MANUELLE',
  IA = 'IA',
  IA_MODIFIEE = 'IA_MODIFIEE',
}

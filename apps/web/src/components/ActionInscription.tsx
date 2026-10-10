import { PlacesEtInscription } from '../lib/api';

/**
 * Bouton « S’inscrire » d'une formation du catalogue (US-INSC-01).
 *
 * - déjà une inscription (quel que soit son statut) : rien ; le badge de
 *   statut affiché à côté dit déjà où en est l'apprenant ;
 * - plus aucune place : la raison, à la place du bouton ;
 * - sinon : le bouton, qui ouvre la confirmation.
 *
 * Le serveur reste juge : ce bouton n'évite qu'une requête vouée au refus.
 */
export function ActionInscription({
  formation,
  onInscrire,
}: {
  formation: PlacesEtInscription;
  onInscrire: () => void;
}): JSX.Element | null {
  if (formation.statutInscription !== null) {
    return null;
  }
  if (formation.placesRestantes === 0) {
    return <span className="muted-cell">Plus de place</span>;
  }
  return (
    <button type="button" className="btn-sm btn-primary-sm" onClick={onInscrire}>
      S’inscrire
    </button>
  );
}

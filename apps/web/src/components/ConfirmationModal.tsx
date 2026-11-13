'use client';
import { useState } from 'react';
import { AdminError } from '../lib/api';
import { Fenetre } from './Fenetre';

/**
 * Modale de confirmation d'une action irréversible (US-QCM-01 : supprimer un
 * QCM ou une question). Même présentation que les autres modales : croix
 * rouge, « Annuler » rouge, bouton d'action à droite. Si l'action échoue, le
 * message exact du serveur s'affiche dans la modale.
 * US-UI-01 : bâtie sur `Fenetre` (Échap, clic extérieur, focus).
 */
export function ConfirmationModal({
  titre,
  message,
  libelleAction,
  onConfirmer,
  onClose,
}: {
  titre: string;
  message: string;
  libelleAction: string;
  onConfirmer: () => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const confirmer = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      await onConfirmer();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'L’action a échoué.');
      setEnCours(false);
    }
  };

  return (
    <Fenetre
      titre={titre}
      onClose={onClose}
      occupe={enCours}
      actions={
        <>
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={onClose}
            disabled={enCours}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void confirmer()}
            disabled={enCours}
          >
            {enCours ? 'En cours…' : libelleAction}
          </button>
        </>
      }
    >
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      <p className="auth-subtitle">{message}</p>
    </Fenetre>
  );
}

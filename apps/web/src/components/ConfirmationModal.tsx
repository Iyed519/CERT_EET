'use client';
import { useState } from 'react';
import { AdminError } from '../lib/api';
import { CroixFermeture } from './CroixFermeture';

/**
 * Modale de confirmation d'une action irréversible (US-QCM-01 : supprimer un
 * QCM ou une question). Même présentation que les autres modales : croix
 * rouge, « Annuler » rouge, bouton d'action à droite. Si l'action échoue, le
 * message exact du serveur s'affiche dans la modale.
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
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">{titre}</h2>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <p className="auth-subtitle">{message}</p>
        <div className="modal-actions">
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
        </div>
      </section>
    </div>
  );
}

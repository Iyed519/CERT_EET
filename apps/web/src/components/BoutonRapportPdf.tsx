'use client';
import { useState } from 'react';
import { AdminError, telechargerRapportTentative } from '../lib/api';

/**
 * US-QCM-13 — Bouton « Télécharger le rapport (PDF) » d'une tentative notée.
 * Le contenu (corrigé inclus ou non) est décidé par le serveur : le bouton ne
 * fait que demander le fichier. Sans `qcmId`, route de l'apprenant ; avec,
 * route du formateur affecté (ou de l'administrateur).
 */
export function BoutonRapportPdf({
  tentativeId,
  qcmId,
  petit = false,
}: {
  tentativeId: string;
  qcmId?: string;
  petit?: boolean;
}): JSX.Element {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const telecharger = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      await telechargerRapportTentative(tentativeId, qcmId);
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de télécharger le rapport.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <span className="rapport-pdf">
      <button
        type="button"
        className={petit ? 'btn-sm' : 'btn btn-secondaire'}
        onClick={() => void telecharger()}
        disabled={enCours}
      >
        {enCours ? 'Préparation du rapport…' : 'Télécharger le rapport (PDF)'}
      </button>
      {erreur !== null && (
        <span className="rapport-pdf-erreur" role="alert">
          {erreur}
        </span>
      )}
    </span>
  );
}

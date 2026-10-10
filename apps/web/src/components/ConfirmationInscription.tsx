'use client';
import { useState } from 'react';
import { AdminError, FormationVue, inscrireFormation, InscriptionVue } from '../lib/api';
import { periodeFr } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/**
 * Modale de confirmation d'une inscription (US-INSC-01).
 *
 * L'inscription est IMMÉDIATE côté serveur (aucune validation par un
 * administrateur) : je demande donc une confirmation explicite avant
 * d'envoyer la requête. En cas de refus (formation complète entre-temps, déjà
 * inscrit…), le message exact du serveur s'affiche dans la modale, et le
 * parent recharge ses données pour refléter l'état réel.
 */
export function ConfirmationInscription({
  formation,
  onClose,
  onInscrit,
  onRefus,
}: {
  formation: Pick<FormationVue, 'id' | 'titre' | 'dateDebut' | 'dateFin'>;
  onClose: () => void;
  onInscrit: (inscription: InscriptionVue) => void;
  onRefus: () => void;
}): JSX.Element {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const periode = periodeFr(formation.dateDebut, formation.dateFin);

  const confirmer = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      onInscrit(await inscrireFormation(formation.id));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de vous inscrire.');
      onRefus();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">Confirmer l’inscription</h2>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <p className="auth-subtitle">
          Vous allez vous inscrire à la formation <strong>« {formation.titre} »</strong>
          {periode ? ` (${periode})` : ''}. L’inscription est immédiate et vous recevrez un
          email de confirmation.
        </p>
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
            disabled={enCours || erreur !== null}
          >
            {enCours ? 'Inscription…' : 'Confirmer'}
          </button>
        </div>
      </section>
    </div>
  );
}

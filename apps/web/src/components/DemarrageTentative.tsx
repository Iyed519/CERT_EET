'use client';
import { useState } from 'react';
import { AdminError, demarrerTentative, TentativeDemarree, TentativeRefusee } from '../lib/api';
import { dateHeureFr, dureeFr } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/** Ce que la modale affiche d'un QCM (vient de « Mon espace »). */
export interface QcmADemarrer {
  id: string;
  titre: string;
  dureeMaxMinutes: number | null;
  nbTentativesMax: number | null;
  nbTentativesPassees: number;
  dateFermeture: string | null;
}

/**
 * Modale de confirmation du démarrage d'une tentative (US-QCM-05, DS-09
 * étape 3A).
 *
 * Le démarrage lance le chronomètre côté serveur : je demande donc une
 * confirmation explicite, avec la durée, le rang de la tentative et
 * l'avertissement que le temps continue de courir même page fermée. Les
 * chiffres viennent de « Mon espace » et ne servent qu'à informer : c'est le
 * serveur qui décide. En cas de refus (409), son message exact s'affiche,
 * suivi de la date de réouverture quand il en donne une.
 */
export function DemarrageTentative({
  qcm,
  onClose,
  onDemarree,
  onRefus,
}: {
  qcm: QcmADemarrer;
  onClose: () => void;
  onDemarree: (tentative: TentativeDemarree) => void;
  onRefus: () => void;
}): JSX.Element {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // La tentative ne dépasse jamais la fermeture du QCM (règle serveur, D5).
  const finAvantDuree =
    qcm.dureeMaxMinutes !== null &&
    qcm.dateFermeture !== null &&
    new Date(qcm.dateFermeture).getTime() < Date.now() + qcm.dureeMaxMinutes * 60_000;

  const confirmer = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      onDemarree(await demarrerTentative(qcm.id));
    } catch (error) {
      if (error instanceof TentativeRefusee && error.dateReouverture) {
        setErreur(
          `${error.message} Nouvel essai possible à partir du ${dateHeureFr(error.dateReouverture)}.`,
        );
      } else {
        setErreur(
          error instanceof AdminError ? error.message : 'Impossible de démarrer l’évaluation.',
        );
      }
      setEnCours(false);
      onRefus();
    }
  };

  return (
    <div
      className="profil-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-demarrage"
    >
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title" id="titre-demarrage">
          Démarrer l’évaluation
        </h2>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <p className="auth-subtitle">
          <strong>« {qcm.titre} »</strong>
        </p>
        <dl className="demarrage-recap">
          {qcm.dureeMaxMinutes !== null && (
            <div>
              <dt>Durée</dt>
              <dd>{dureeFr(qcm.dureeMaxMinutes)}</dd>
            </div>
          )}
          {qcm.nbTentativesMax !== null && (
            <div>
              <dt>Tentative</dt>
              <dd>
                {Math.min(qcm.nbTentativesPassees + 1, qcm.nbTentativesMax)} sur{' '}
                {qcm.nbTentativesMax}
              </dd>
            </div>
          )}
          {qcm.dateFermeture !== null && (
            <div>
              <dt>Fermeture</dt>
              <dd>{dateHeureFr(qcm.dateFermeture)}</dd>
            </div>
          )}
        </dl>
        <p className="alert alert-info demarrage-avertissement">
          Le chronomètre démarre dès la confirmation et continue même si vous fermez la page.
          {finAvantDuree
            ? ' Le QCM ferme avant la fin de la durée : votre temps s’arrêtera à la fermeture.'
            : ''}
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
            {enCours ? 'Démarrage…' : 'Démarrer'}
          </button>
        </div>
      </section>
    </div>
  );
}

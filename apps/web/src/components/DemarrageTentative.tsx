'use client';
import { useState } from 'react';
import {
  AdminError,
  CONSEIL_SESSION_AILLEURS,
  demarrerTentative,
  refuserSurveillance,
  TentativeDemarree,
  TentativeRefusee,
} from '../lib/api';
import { dateHeureFr, dureeFr } from '../lib/format';
import { Fenetre } from './Fenetre';

/** Ce que la modale affiche d'un QCM (vient de « Mon espace »). */
export interface QcmADemarrer {
  id: string;
  titre: string;
  dureeMaxMinutes: number | null;
  nbTentativesMax: number | null;
  nbTentativesPassees: number;
  dateFermeture: string | null;
  // US-QCM-12 — QCM surveillé par webcam : consentement demandé avant de commencer.
  surveillanceWebcam?: boolean;
}

/**
 * US-QCM-12 — Vérifie qu'une caméra est disponible et autorisée, puis la
 * relâche aussitôt (la page de passage la rouvrira pour les captures).
 */
async function cameraDisponible(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const flux = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: false,
    });
    flux.getTracks().forEach((piste) => piste.stop());
    return true;
  } catch {
    return false;
  }
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
 * suivi de la date de réouverture quand il en donne une, ou d'un conseil
 * quand la tentative est en cours sur un autre appareil (US-QCM-10).
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
  // US-QCM-12 : consentement coché, et message de refus (procédure alternative).
  const [consentement, setConsentement] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const surveille = qcm.surveillanceWebcam === true;

  const refuser = async (motif: 'REFUS' | 'CAMERA_INDISPONIBLE'): Promise<void> => {
    setEnCours(true);
    setRefus(await refuserSurveillance(qcm.id, motif));
    setEnCours(false);
  };

  // La tentative ne dépasse jamais la fermeture du QCM (règle serveur, D5).
  const finAvantDuree =
    qcm.dureeMaxMinutes !== null &&
    qcm.dateFermeture !== null &&
    new Date(qcm.dateFermeture).getTime() < Date.now() + qcm.dureeMaxMinutes * 60_000;

  const confirmer = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    if (surveille && !(await cameraDisponible())) {
      // Caméra refusée par le navigateur ou absente : pas de tentative.
      setRefus(await refuserSurveillance(qcm.id, 'CAMERA_INDISPONIBLE'));
      setEnCours(false);
      return;
    }
    try {
      onDemarree(
        await demarrerTentative(qcm.id, surveille ? { consentementSurveillance: true } : {}),
      );
    } catch (error) {
      if (error instanceof TentativeRefusee && error.raison === 'session_active_ailleurs') {
        // US-QCM-10 — tentative déjà en cours sur un autre appareil.
        setErreur(`${error.message} ${CONSEIL_SESSION_AILLEURS}`);
      } else if (error instanceof TentativeRefusee && error.dateReouverture) {
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
    <Fenetre titre="Démarrer l’évaluation" onClose={onClose} occupe={enCours}>
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
        {surveille && refus === null && (
          <section className="surveillance-notice" aria-labelledby="titre-surveillance">
            <h3 id="titre-surveillance">Surveillance par webcam</h3>
            <ul>
              <li>
                Votre formateur a activé la surveillance de ce QCM : une image de votre caméra est
                prise au démarrage, puis toutes les 2 minutes environ, pendant le passage seulement.
              </li>
              <li>
                Votre caméra est aussi analysée automatiquement, sur votre ordinateur : si plusieurs
                personnes, un téléphone, un livre, une absence de plus de 5 minutes, une caméra
                masquée ou la page quittée sont détectés, une photo de l’instant est envoyée à votre
                formateur avec l’alerte. C’est lui qui décide : aucune sanction automatique.
              </li>
              <li>
                Pas de vidéo enregistrée, pas de son, aucune reconnaissance du visage. Les images ne
                sont visibles que par le formateur de la formation et l’administration, et sont
                supprimées au bout de 30 jours.
              </li>
              <li>
                Si vous refusez ou n’avez pas de caméra, vous ne pourrez pas passer ce QCM en ligne :
                demandez à votre formateur un passage surveillé en présentiel.
              </li>
            </ul>
            <label className="case">
              <input
                type="checkbox"
                checked={consentement}
                onChange={(e) => setConsentement(e.target.checked)}
                disabled={enCours}
              />
              J’ai lu ces informations et j’accepte la surveillance par webcam pour ce QCM.
            </label>
          </section>
        )}
        {refus !== null && <p className="alert alert-error">{refus}</p>}
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
          {surveille && refus === null && (
            <button
              type="button"
              className="btn-sm btn-ghost"
              onClick={() => void refuser('REFUS')}
              disabled={enCours}
            >
              Je refuse
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => void confirmer()}
            disabled={
              enCours || erreur !== null || refus !== null || (surveille && !consentement)
            }
          >
            {enCours ? 'Démarrage…' : surveille ? 'Accepter et démarrer' : 'Démarrer'}
          </button>
        </div>
    </Fenetre>
  );
}

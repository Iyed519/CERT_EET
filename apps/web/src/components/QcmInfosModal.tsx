'use client';
import { FormEvent, useState } from 'react';
import { AdminError, createQcm, QcmDetail, QcmResume, updateQcm } from '../lib/api';
import { CroixFermeture } from './CroixFermeture';

/**
 * Modale « titre et description » d'un QCM (US-QCM-01) : création dans un
 * module (le QCM naît en brouillon), ou modification d'un QCM existant —
 * toujours permise, même après des tentatives (métadonnées seulement).
 */
export function QcmInfosModal({
  moduleId,
  moduleTitre,
  qcm,
  onClose,
  onEnregistre,
}: {
  moduleId?: string;
  moduleTitre?: string;
  qcm?: QcmDetail;
  onClose: () => void;
  onEnregistre: (qcm: QcmResume) => void;
}): JSX.Element {
  const creation = qcm === undefined;
  const [titre, setTitre] = useState(qcm?.titre ?? '');
  const [description, setDescription] = useState(qcm?.description ?? '');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = creation
        ? await createQcm(moduleId as string, {
            titre,
            ...(description.trim() ? { description } : {}),
          })
        : await updateQcm(qcm.id, {
            titre,
            description: description.trim() ? description : null,
          });
      onEnregistre(resultat);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’enregistrer le QCM.');
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">{creation ? 'Nouveau QCM' : 'Modifier le QCM'}</h2>
        {creation && moduleTitre && (
          <p className="auth-subtitle">
            Dans le module « {moduleTitre} ». Il sera créé en brouillon : ajoutez ensuite ses
            questions.
          </p>
        )}
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="qcm-titre">
              Titre
            </label>
            <input
              id="qcm-titre"
              className="input"
              required
              maxLength={255}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="qcm-description">
              Description (facultative)
            </label>
            <textarea
              id="qcm-description"
              className="input"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={enCours}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button type="submit" className="btn" disabled={enCours}>
              {enCours ? 'Enregistrement…' : creation ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

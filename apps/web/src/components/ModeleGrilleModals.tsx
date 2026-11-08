'use client';
import { FormEvent, useEffect, useState } from 'react';
import {
  AdminError,
  copierModele,
  deleteModeleGrille,
  enregistrerModele,
  getModelesGrille,
  GrilleNotation,
  ModeleGrille,
} from '../lib/api';
import { CroixFermeture } from './CroixFermeture';

/**
 * « Enregistrer comme modèle » (US-ATEL-02) : une COPIE de la grille devient
 * un modèle réutilisable du formateur. La grille de l'atelier ne change pas.
 */
export function EnregistrerModeleModal({
  atelierId,
  titreSuggere,
  onClose,
  onEnregistre,
}: {
  atelierId: string;
  titreSuggere: string;
  onClose: () => void;
  onEnregistre: (modele: ModeleGrille) => void;
}): JSX.Element {
  const [nom, setNom] = useState(titreSuggere.slice(0, 120));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      onEnregistre(await enregistrerModele(atelierId, nom));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’enregistrer le modèle.');
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">Enregistrer comme modèle</h2>
        <p className="auth-subtitle">
          Une copie de cette grille rejoint vos modèles : vous pourrez partir d’elle pour vos
          prochains ateliers. Elle reste disponible même si cet atelier est supprimé.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="modele-nom">
              Nom du modèle
            </label>
            <input
              id="modele-nom"
              className="input"
              required
              minLength={3}
              maxLength={120}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              disabled={enCours}
            />
            <span className="field-hint">Unique parmi vos modèles.</span>
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
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/**
 * « Partir d'un modèle » (US-ATEL-02) : choisir un modèle, confirmer, et la
 * grille de l'atelier est remplacée par une copie indépendante, à valider.
 * Mes modèles se suppriment aussi d'ici.
 */
export function ChoisirModeleModal({
  atelierId,
  nbCriteresActuels,
  onClose,
  onCopie,
}: {
  atelierId: string;
  nbCriteresActuels: number;
  onClose: () => void;
  onCopie: (grille: GrilleNotation) => void;
}): JSX.Element {
  const [modeles, setModeles] = useState<ModeleGrille[] | null>(null);
  const [choisi, setChoisi] = useState<ModeleGrille | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getModelesGrille()
      .then(setModeles)
      .catch((error: unknown) => {
        setModeles([]);
        setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les modèles.');
      });
  }, []);

  const executer = async (action: () => Promise<void>): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const copier = (modele: ModeleGrille): Promise<void> =>
    executer(async () => onCopie(await copierModele(atelierId, modele.id)));

  const supprimer = (modeleId: string): Promise<void> =>
    executer(async () => {
      await deleteModeleGrille(modeleId);
      setModeles((liste) => (liste ?? []).filter((m) => m.id !== modeleId));
      setASupprimer(null);
    });

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">{choisi ? 'Remplacer la grille ?' : 'Partir d’un modèle'}</h2>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}

        {choisi ? (
          <>
            <p className="auth-subtitle">
              {nbCriteresActuels > 0
                ? `Les ${nbCriteresActuels} critère${nbCriteresActuels > 1 ? 's' : ''} actuel${nbCriteresActuels > 1 ? 's' : ''} seront remplacés par ceux de « ${choisi.nomModele} ».`
                : `La grille reprendra les critères de « ${choisi.nomModele} ».`}{' '}
              La copie est indépendante du modèle et devra être validée.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={() => setChoisi(null)}
                disabled={enCours}
              >
                Retour
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void copier(choisi)}
                disabled={enCours}
              >
                {enCours ? 'Copie…' : 'Remplacer'}
              </button>
            </div>
          </>
        ) : modeles === null ? (
          <p className="auth-subtitle">Chargement…</p>
        ) : modeles.length === 0 ? (
          <p className="auth-subtitle">
            Aucun modèle pour l’instant. Une grille complète (100 %) s’enregistre comme modèle avec
            « Enregistrer comme modèle ».
          </p>
        ) : (
          <ul className="modeles-liste">
            {modeles.map((m) => (
              <li key={m.id} className="modele-item">
                <div className="modele-corps">
                  <p className="modele-nom">{m.nomModele}</p>
                  <p className="muted-cell modele-criteres">
                    {m.criteres.map((c) => `${c.intitule} ${c.ponderation} %`).join(' · ')}
                  </p>
                </div>
                <div className="row-actions">
                  {aSupprimer === m.id ? (
                    <>
                      <button
                        className="btn-sm"
                        onClick={() => setASupprimer(null)}
                        disabled={enCours}
                      >
                        Garder
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => void supprimer(m.id)}
                        disabled={enCours}
                      >
                        Confirmer la suppression
                      </button>
                    </>
                  ) : (
                    <>
                      {m.estAMoi && (
                        <button
                          className="btn-sm btn-danger"
                          onClick={() => setASupprimer(m.id)}
                          disabled={enCours}
                          aria-label={`Supprimer le modèle ${m.nomModele}`}
                        >
                          Supprimer
                        </button>
                      )}
                      <button
                        className="btn-sm btn-primary-sm"
                        onClick={() => setChoisi(m)}
                        disabled={enCours}
                      >
                        Utiliser
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

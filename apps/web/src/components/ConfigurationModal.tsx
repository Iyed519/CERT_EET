'use client';
import { FormEvent, useState } from 'react';
import {
  AdminError,
  AffichageResultats,
  configureQcm,
  ConfigurationQcm,
  QcmDetail,
} from '../lib/api';
import { depuisSaisieLocale, LIBELLES_AFFICHAGE, versSaisieLocale } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/** Valeurs proposées pour une première configuration. */
function valeursParDefaut(): ConfigurationQcm {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const ouverture = new Date(demain);
  ouverture.setHours(8, 0, 0, 0);
  const fermeture = new Date(demain);
  fermeture.setHours(18, 0, 0, 0);
  return {
    randomiserQuestions: true,
    randomiserOptions: true,
    nbQuestionsTirees: null,
    dureeMaxMinutes: 30,
    dateOuverture: ouverture.toISOString(),
    dateFermeture: fermeture.toISOString(),
    nbTentativesMax: 1,
    delaiEntreTentatives: 0,
    blocageSessionsMultiples: true,
    affichageResultats: 'DIFFERE',
    scoreMinValidation: 60,
    ponderationFormation: 100,
    proctoringWebcam: false,
    desactiverCopierColler: false,
  };
}

/**
 * La configuration renvoyée par le serveur porte `updatedAt` ; le corps du PUT
 * ne doit contenir que les 14 paramètres (tout champ en trop est refusé).
 */
function sansHorodatage(c: ConfigurationQcm): ConfigurationQcm {
  return {
    randomiserQuestions: c.randomiserQuestions,
    randomiserOptions: c.randomiserOptions,
    nbQuestionsTirees: c.nbQuestionsTirees,
    dureeMaxMinutes: c.dureeMaxMinutes,
    dateOuverture: c.dateOuverture,
    dateFermeture: c.dateFermeture,
    nbTentativesMax: c.nbTentativesMax,
    delaiEntreTentatives: c.delaiEntreTentatives,
    blocageSessionsMultiples: c.blocageSessionsMultiples,
    affichageResultats: c.affichageResultats,
    scoreMinValidation: c.scoreMinValidation,
    ponderationFormation: c.ponderationFormation,
    proctoringWebcam: c.proctoringWebcam,
    desactiverCopierColler: c.desactiverCopierColler,
  };
}

/**
 * Modale « Paramètres anti-fraude » d'un QCM (US-QCM-03, UC2 Formateur).
 *
 * Champs regroupés comme dans l'UC : Randomisation · Temps · Tentatives (dont
 * le blocage des sessions multiples, appliqué depuis US-QCM-10) · Résultat ·
 * Bientôt actif. Les dates se saisissent à l'heure locale du
 * navigateur et partent au serveur en ISO 8601 (UTC).
 *
 * QCM déjà tenté : seule la date de fermeture reste saisissable (le serveur
 * n'accepte que de la repousser) ; tout le reste est en lecture seule.
 * Le serveur reste juge : son message exact s'affiche en cas de refus.
 */
export function ConfigurationModal({
  qcm,
  onClose,
  onEnregistree,
}: {
  qcm: QcmDetail;
  onClose: () => void;
  onEnregistree: () => void;
}): JSX.Element {
  const initiale: ConfigurationQcm = qcm.configuration
    ? sansHorodatage(qcm.configuration)
    : valeursParDefaut();
  const [c, setC] = useState<ConfigurationQcm>(initiale);
  const [tirage, setTirage] = useState(initiale.nbQuestionsTirees !== null);
  const [ouverture, setOuverture] = useState(versSaisieLocale(initiale.dateOuverture));
  const [fermeture, setFermeture] = useState(versSaisieLocale(initiale.dateFermeture));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const fige = qcm.verrouille || enCours;

  const nombre =
    (champ: keyof ConfigurationQcm) =>
    (e: React.ChangeEvent<HTMLInputElement>): void =>
      setC({ ...c, [champ]: e.target.value === '' ? NaN : Number(e.target.value) });
  const coche =
    (champ: keyof ConfigurationQcm) =>
    (e: React.ChangeEvent<HTMLInputElement>): void =>
      setC({ ...c, [champ]: e.target.checked });

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await configureQcm(qcm.id, {
        ...c,
        nbQuestionsTirees: tirage ? c.nbQuestionsTirees : null,
        dateOuverture: depuisSaisieLocale(ouverture),
        dateFermeture: depuisSaisieLocale(fermeture),
      });
      onEnregistree();
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : 'Impossible d’enregistrer les paramètres anti-fraude.',
      );
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">Paramètres anti-fraude</h2>
        <p className="auth-subtitle">
          Appliqués par le serveur pendant le passage : l’apprenant ne peut pas les contourner.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {qcm.verrouille && (
          <p className="alert alert-info">
            Des apprenants ont déjà passé ce QCM : ses paramètres sont figés. Vous pouvez seulement
            repousser la date de fermeture.
          </p>
        )}

        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <fieldset className="groupe-config" disabled={fige}>
            <legend className="field-label">Randomisation</legend>
            <label className="case">
              <input
                type="checkbox"
                checked={c.randomiserQuestions}
                onChange={coche('randomiserQuestions')}
              />
              Mélanger l’ordre des questions
            </label>
            <label className="case">
              <input
                type="checkbox"
                checked={c.randomiserOptions}
                onChange={coche('randomiserOptions')}
              />
              Mélanger l’ordre des options
            </label>
            <label className="case">
              <input
                type="checkbox"
                checked={tirage}
                onChange={(e) => {
                  setTirage(e.target.checked);
                  if (e.target.checked && c.nbQuestionsTirees === null) {
                    setC({ ...c, nbQuestionsTirees: qcm.nbQuestions });
                  }
                }}
              />
              Tirer au sort une partie des questions
            </label>
            {tirage && (
              <div className="field">
                <label className="field-label" htmlFor="c-tirage">
                  Nombre de questions tirées (sur {qcm.nbQuestions})
                </label>
                <input
                  id="c-tirage"
                  className="input input-auto"
                  type="number"
                  min={1}
                  max={qcm.nbQuestions}
                  step={1}
                  required
                  value={Number.isNaN(c.nbQuestionsTirees) ? '' : (c.nbQuestionsTirees ?? '')}
                  onChange={nombre('nbQuestionsTirees')}
                />
              </div>
            )}
          </fieldset>

          <fieldset className="groupe-config">
            <legend className="field-label">Temps</legend>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="c-duree">
                  Durée d’une tentative (min)
                </label>
                <input
                  id="c-duree"
                  className="input"
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  required
                  value={Number.isNaN(c.dureeMaxMinutes) ? '' : c.dureeMaxMinutes}
                  onChange={nombre('dureeMaxMinutes')}
                  disabled={fige}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="c-ouverture">
                  Ouverture
                </label>
                <input
                  id="c-ouverture"
                  className="input"
                  type="datetime-local"
                  required
                  value={ouverture}
                  onChange={(e) => setOuverture(e.target.value)}
                  disabled={fige}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="c-fermeture">
                  Fermeture
                </label>
                <input
                  id="c-fermeture"
                  className="input"
                  type="datetime-local"
                  required
                  value={fermeture}
                  onChange={(e) => setFermeture(e.target.value)}
                  disabled={enCours}
                />
              </div>
            </div>
            <span className="field-hint">
              Heures locales. La fenêtre doit durer au moins autant qu’une tentative.
            </span>
          </fieldset>

          <fieldset className="groupe-config" disabled={fige}>
            <legend className="field-label">Tentatives</legend>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="c-tentatives">
                  Tentatives par apprenant (1 à 20)
                </label>
                <input
                  id="c-tentatives"
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  required
                  value={Number.isNaN(c.nbTentativesMax) ? '' : c.nbTentativesMax}
                  onChange={nombre('nbTentativesMax')}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="c-delai">
                  Délai entre deux tentatives (h)
                </label>
                <input
                  id="c-delai"
                  className="input"
                  type="number"
                  min={0}
                  max={720}
                  step={1}
                  required
                  value={Number.isNaN(c.delaiEntreTentatives) ? '' : c.delaiEntreTentatives}
                  onChange={nombre('delaiEntreTentatives')}
                />
              </div>
            </div>
            {/* US-QCM-10 — appliqué par le serveur : sorti de « Bientôt actif ». */}
            <label className="case">
              <input
                type="checkbox"
                checked={c.blocageSessionsMultiples}
                onChange={coche('blocageSessionsMultiples')}
              />
              Bloquer les sessions multiples (un seul appareil à la fois)
            </label>
          </fieldset>

          <fieldset className="groupe-config" disabled={fige}>
            <legend className="field-label">Résultat</legend>
            <div className="field">
              <label className="field-label" htmlFor="c-affichage">
                Affichage du résultat
              </label>
              <select
                id="c-affichage"
                className="input"
                value={c.affichageResultats}
                onChange={(e) =>
                  setC({ ...c, affichageResultats: e.target.value as AffichageResultats })
                }
              >
                {(Object.keys(LIBELLES_AFFICHAGE) as AffichageResultats[]).map((a) => (
                  <option key={a} value={a}>
                    {LIBELLES_AFFICHAGE[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="c-seuil">
                  Seuil de réussite (%)
                </label>
                <input
                  id="c-seuil"
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  required
                  value={Number.isNaN(c.scoreMinValidation) ? '' : c.scoreMinValidation}
                  onChange={nombre('scoreMinValidation')}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="c-ponderation">
                  Poids dans la formation (%)
                </label>
                <input
                  id="c-ponderation"
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  required
                  value={Number.isNaN(c.ponderationFormation) ? '' : c.ponderationFormation}
                  onChange={nombre('ponderationFormation')}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="groupe-config" disabled={fige}>
            <legend className="field-label">
              Bientôt actif <span className="badge-bientot">enregistré, pas encore appliqué</span>
            </legend>
            <label className="case">
              <input
                type="checkbox"
                checked={c.desactiverCopierColler}
                onChange={coche('desactiverCopierColler')}
              />
              Désactiver le copier-coller
            </label>
            <label className="case">
              <input
                type="checkbox"
                checked={c.proctoringWebcam}
                onChange={coche('proctoringWebcam')}
              />
              Surveillance par webcam (proctoring)
            </label>
          </fieldset>

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

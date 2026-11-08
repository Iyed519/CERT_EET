'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  addCritere,
  AdminError,
  CritereGrille,
  GrilleNotation,
  LIBELLES_NIVEAUX,
  PLAGES_PAR_DEFAUT,
  updateCritere,
} from '../lib/api';
import { CroixFermeture } from './CroixFermeture';

/**
 * Modale d'un critère de la grille (US-ATEL-02, DS-13 partie 2) : ajout ou
 * modification.
 *
 * Les 4 niveaux (Insuffisant → Excellent) se suivent sans trou : je ne fais
 * saisir que les 3 bornes intérieures (25 / 50 / 75 par défaut) ; le
 * premier niveau commence à 0 % et le dernier finit à 100 %. Le serveur
 * revérifie tout.
 *
 * Le total de la grille APRÈS l'enregistrement s'affiche en temps réel ; au-delà
 * de 100 % le bouton est bloqué et le message dit de combien réduire.
 */
export function CritereModal({
  atelierId,
  critere,
  totalAutres,
  onClose,
  onEnregistre,
}: {
  atelierId: string;
  /** Absent : ajout. */
  critere?: CritereGrille;
  /** Somme des pondérations des AUTRES critères. */
  totalAutres: number;
  onClose: () => void;
  onEnregistre: (grille: GrilleNotation) => void;
}): JSX.Element {
  const creation = critere === undefined;
  const [intitule, setIntitule] = useState(critere?.intitule ?? '');
  const [ponderation, setPonderation] = useState<number>(
    critere?.ponderation ?? Math.max(1, Math.min(100, 100 - totalAutres)),
  );
  const [description, setDescription] = useState(critere?.description ?? '');
  // Bornes intérieures : fin des niveaux 1, 2 et 3.
  const [bornes, setBornes] = useState<number[]>(
    critere
      ? critere.niveaux.slice(0, 3).map((n) => n.pointsMaxPct)
      : PLAGES_PAR_DEFAUT.slice(0, 3).map(([, max]) => max),
  );
  const [descripteurs, setDescripteurs] = useState<string[]>(
    critere ? critere.niveaux.map((n) => n.descripteur ?? '') : ['', '', '', ''],
  );
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const refErreur = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (erreur !== null) refErreur.current?.scrollIntoView({ block: 'nearest' });
  }, [erreur]);

  const total = totalAutres + (Number.isNaN(ponderation) ? 0 : ponderation);
  const depasse = total > 100;
  const plages = [0, ...bornes, 100];
  const bornesCroissantes = plages.every(
    (v, i) => i === 0 || (Number.isInteger(v) && v > plages[i - 1]),
  );

  const changerBorne = (i: number, valeur: string): void =>
    setBornes((b) => b.map((v, j) => (j === i ? (valeur === '' ? NaN : Number(valeur)) : v)));
  const changerDescripteur = (i: number, valeur: string): void =>
    setDescripteurs((d) => d.map((v, j) => (j === i ? valeur : v)));

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (depasse) return;
    if (!bornesCroissantes) {
      setErreur('Les bornes des niveaux doivent être des entiers strictement croissants entre 0 et 100.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    const niveaux = LIBELLES_NIVEAUX.map((_, i) => ({
      pointsMinPct: plages[i],
      pointsMaxPct: plages[i + 1],
      descripteur: descripteurs[i].trim() ? descripteurs[i] : null,
    }));
    try {
      const grille = creation
        ? await addCritere(atelierId, {
            intitule,
            ponderation,
            ...(description.trim() ? { description } : {}),
            niveaux,
          })
        : await updateCritere(atelierId, critere.id, {
            intitule,
            ponderation,
            description: description.trim() ? description : null,
            niveaux,
          });
      onEnregistre(grille);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’enregistrer le critère.');
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">{creation ? 'Ajouter un critère' : 'Modifier le critère'}</h2>
        <p className="auth-subtitle">
          Chaque critère pèse un pourcentage de la note ; la grille doit totaliser exactement 100 %.
        </p>
        {erreur !== null && (
          <p ref={refErreur} className="alert alert-error">
            {erreur}
          </p>
        )}
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-grid grille-champs">
            <div className="field">
              <label className="field-label" htmlFor="cr-intitule">
                Intitulé
              </label>
              <input
                id="cr-intitule"
                className="input"
                required
                minLength={3}
                maxLength={200}
                value={intitule}
                onChange={(e) => setIntitule(e.target.value)}
                disabled={enCours}
                placeholder="Fonctionnement, Sécurité, Documentation…"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cr-ponderation">
                Pondération (%)
              </label>
              <input
                id="cr-ponderation"
                className="input"
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={Number.isNaN(ponderation) ? '' : ponderation}
                onChange={(e) =>
                  setPonderation(e.target.value === '' ? NaN : Number(e.target.value))
                }
                disabled={enCours}
              />
            </div>
          </div>
          <p
            className={`total-apercu ${depasse ? 'total-depasse' : total === 100 ? 'total-ok' : 'total-incomplet'}`}
            aria-live="polite"
          >
            {depasse
              ? `Total de la grille : ${total} % — au-delà de 100 %, réduisez de ${total - 100} %.`
              : `Total de la grille après enregistrement : ${total} %${total === 100 ? ' ✓' : ` (il restera ${100 - total} %)`}.`}
          </p>
          <div className="field">
            <label className="field-label" htmlFor="cr-description">
              Description (facultatif)
            </label>
            <textarea
              id="cr-description"
              className="input"
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={enCours}
              placeholder="Ce que le critère évalue."
            />
          </div>

          <fieldset className="groupe-config" disabled={enCours}>
            <legend className="field-label">Niveaux de performance</legend>
            <span className="field-hint">
              Plages en % des points du critère. Elles se suivent : chaque niveau commence où le
              précédent s’arrête.
            </span>
            <div className="niveaux-saisie">
              {LIBELLES_NIVEAUX.map((libelle, i) => (
                <div key={libelle} className={`niveau-saisie niveau-${i + 1}`}>
                  <div className="niveau-saisie-tete">
                    <span className="niveau-libelle">{libelle}</span>
                    <span className="niveau-plage">
                      {Number.isNaN(plages[i]) ? '…' : plages[i]} –{' '}
                      {i < 3 ? (
                        <input
                          className="input input-borne"
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          required
                          aria-label={`Fin du niveau ${libelle} (%)`}
                          value={Number.isNaN(bornes[i]) ? '' : bornes[i]}
                          onChange={(e) => changerBorne(i, e.target.value)}
                        />
                      ) : (
                        100
                      )}{' '}
                      %
                    </span>
                  </div>
                  <input
                    className="input"
                    maxLength={1000}
                    aria-label={`Descripteur du niveau ${libelle}`}
                    placeholder="Descripteur (facultatif)"
                    value={descripteurs[i]}
                    onChange={(e) => changerDescripteur(i, e.target.value)}
                  />
                </div>
              ))}
            </div>
            {!bornesCroissantes && (
              <span className="field-hint texte-erreur">
                Les bornes doivent être strictement croissantes (ex. 25, 50, 75).
              </span>
            )}
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
            <button type="submit" className="btn" disabled={enCours || depasse}>
              {enCours ? 'Enregistrement…' : creation ? 'Ajouter' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

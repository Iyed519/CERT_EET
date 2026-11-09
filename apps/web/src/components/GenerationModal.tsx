'use client';
import { FormEvent, useState } from 'react';
import {
  AdminError,
  GenerationIa,
  lancerGeneration,
  NIVEAUX_GENERATION,
  NiveauGeneration,
  SupportPedagogique,
  TYPES_GENERABLES,
  TypeGenerable,
} from '../lib/api';
import { LIBELLES_NIVEAU_GENERATION, LIBELLES_TYPE_GENERABLE } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

const NB_MAX = 20;

/**
 * US-IA-02 — Paramétrer et lancer une génération de questions par IA (DS-06
 * partie 2, UC10 Formateur) à partir d'un support indexé : nombre (1–20),
 * types, niveau, thème facultatif. Le serveur répond tout de suite ; les
 * suggestions arrivent ensuite (pipeline US-IA-03, révision US-IA-04).
 */
export function GenerationModal({
  moduleId,
  support,
  onClose,
  onLancee,
}: {
  moduleId: string;
  support: SupportPedagogique;
  onClose: () => void;
  onLancee: (generation: GenerationIa) => void;
}): JSX.Element {
  const [nbQuestions, setNbQuestions] = useState(10);
  const [types, setTypes] = useState<TypeGenerable[]>(['QCU', 'QCM']);
  const [niveau, setNiveau] = useState<NiveauGeneration>('INTERMEDIAIRE');
  const [focus, setFocus] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const basculer = (t: TypeGenerable): void =>
    setTypes((actuels) => (actuels.includes(t) ? actuels.filter((x) => x !== t) : [...actuels, t]));

  const valide = Number.isInteger(nbQuestions) && nbQuestions >= 1 && nbQuestions <= NB_MAX && types.length > 0;

  const envoyer = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!valide) {
      setErreur('Choisissez entre 1 et 20 questions et au moins un type.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const generation = await lancerGeneration(moduleId, {
        supportId: support.id,
        nbQuestions,
        types,
        niveau,
        ...(focus.trim() ? { focusThematique: focus.trim() } : {}),
      });
      onLancee(generation);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de lancer la génération.');
      setEnvoi(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={envoi} />
        <h2 className="auth-title">Générer des questions</h2>
        <p className="auth-subtitle">
          Source : « {support.titre} ». Les questions seront proposées à votre révision : aucune
          n’est publiée sans votre validation.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void envoyer(e)}>
          <div className="field">
            <label className="field-label" htmlFor="gen-nb">
              Nombre de questions
            </label>
            <input
              id="gen-nb"
              className="input"
              type="number"
              min={1}
              max={NB_MAX}
              value={Number.isNaN(nbQuestions) ? '' : nbQuestions}
              disabled={envoi}
              onChange={(e) => setNbQuestions(e.target.valueAsNumber)}
            />
            <span className="field-hint">Entre 1 et 20 par génération.</span>
          </div>
          <fieldset className="field generation-types" disabled={envoi}>
            <legend className="field-label">Types de questions</legend>
            {TYPES_GENERABLES.map((t) => (
              <label key={t} className="generation-type">
                <input type="checkbox" checked={types.includes(t)} onChange={() => basculer(t)} />
                {LIBELLES_TYPE_GENERABLE[t]}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label className="field-label" htmlFor="gen-niveau">
              Niveau
            </label>
            <select
              id="gen-niveau"
              className="input"
              value={niveau}
              disabled={envoi}
              onChange={(e) => setNiveau(e.target.value as NiveauGeneration)}
            >
              {NIVEAUX_GENERATION.map((n) => (
                <option key={n} value={n}>
                  {LIBELLES_NIVEAU_GENERATION[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="gen-focus">
              Thème à privilégier (facultatif)
            </label>
            <input
              id="gen-focus"
              className="input"
              maxLength={200}
              value={focus}
              disabled={envoi}
              placeholder="ex. : sécurité des jetons JWT"
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger-solid" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={envoi || !valide}>
              {envoi ? 'Lancement…' : 'Générer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

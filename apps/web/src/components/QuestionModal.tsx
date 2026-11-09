'use client';
import { FormEvent, useState } from 'react';
import {
  addQuestion,
  AdminError,
  NiveauDifficulte,
  QuestionInput,
  QuestionQcm,
  replaceQuestion,
  TypeQuestion,
} from '../lib/api';
import { LIBELLES_NIVEAU, LIBELLES_TYPE_QUESTION } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

interface OptionSaisie {
  texte: string;
  estCorrecte: boolean;
}

const MAX_OPTIONS = 10;
const OPTIONS_VRAI_FAUX: OptionSaisie[] = [
  { texte: 'Vrai', estCorrecte: true },
  { texte: 'Faux', estCorrecte: false },
];

/**
 * Modale d'ajout ou de modification d'une question (US-QCM-01).
 *
 * - Choix unique et Vrai/Faux : une seule bonne réponse (bouton radio) ;
 *   choix multiple : plusieurs (cases à cocher).
 * - Vrai/Faux : les deux options sont fixées (« Vrai », « Faux »), on choisit
 *   seulement la bonne.
 * - QCM verrouillé (des tentatives existent) : tout est en lecture seule sauf
 *   l'explication, seule modification que le serveur accepte encore.
 *
 * Le serveur reste juge des règles (≥ 2 options, bonnes réponses…) : son
 * message exact s'affiche dans la modale en cas de refus.
 *
 * US-IA-04 : `revision` réutilise la même saisie pour retoucher une
 * suggestion de l'IA avant de l'accepter (titre, bouton et envoi propres).
 */
export function QuestionModal({
  qcmId,
  question,
  verrouille,
  onClose,
  onEnregistree,
  revision,
}: {
  qcmId: string;
  question: QuestionQcm | null;
  verrouille: boolean;
  onClose: () => void;
  onEnregistree: () => void;
  revision?: {
    titre: string;
    sousTitre: string;
    libelleEnvoi: string;
    envoyer: (corps: QuestionInput) => Promise<void>;
  };
}): JSX.Element {
  const creation = question === null;
  const [enonce, setEnonce] = useState(question?.enonce ?? '');
  const [type, setType] = useState<TypeQuestion>(question?.type ?? 'QCU');
  const [ponderation, setPonderation] = useState(String(question?.ponderation ?? 1));
  const [niveau, setNiveau] = useState<NiveauDifficulte | ''>(question?.niveauDifficulte ?? '');
  const [explication, setExplication] = useState(question?.explication ?? '');
  const [options, setOptions] = useState<OptionSaisie[]>(
    question
      ? question.options.map((o) => ({ texte: o.texte, estCorrecte: o.estCorrecte }))
      : [
          { texte: '', estCorrecte: true },
          { texte: '', estCorrecte: false },
        ],
  );
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const contenuFige = verrouille || enCours;
  const choixUnique = type !== 'QCM';

  const changerType = (nouveau: TypeQuestion): void => {
    setType(nouveau);
    if (nouveau === 'VRAI_FAUX') {
      setOptions(OPTIONS_VRAI_FAUX.map((o) => ({ ...o })));
      return;
    }
    if (type === 'VRAI_FAUX') {
      setOptions([
        { texte: '', estCorrecte: true },
        { texte: '', estCorrecte: false },
      ]);
      return;
    }
    if (nouveau === 'QCU') {
      // Une seule bonne réponse : je garde la première cochée.
      const premiere = options.findIndex((o) => o.estCorrecte);
      setOptions(options.map((o, i) => ({ ...o, estCorrecte: i === Math.max(premiere, 0) })));
    }
  };

  const marquer = (index: number): void => {
    setOptions(
      options.map((o, i) =>
        choixUnique
          ? { ...o, estCorrecte: i === index }
          : i === index
            ? { ...o, estCorrecte: !o.estCorrecte }
            : o,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setEnCours(true);
    setErreur(null);
    const corps: QuestionInput = {
      enonce,
      type,
      ponderation: Number(ponderation),
      options,
      ...(explication.trim() ? { explication } : {}),
      ...(niveau ? { niveauDifficulte: niveau } : {}),
    };
    try {
      if (revision) {
        await revision.envoyer(corps);
      } else if (creation) {
        await addQuestion(qcmId, corps);
      } else {
        await replaceQuestion(qcmId, question.id, corps);
      }
      onEnregistree();
    } catch (error) {
      setErreur(
        error instanceof AdminError ? error.message : 'Impossible d’enregistrer la question.',
      );
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">
          {revision ? revision.titre : creation ? 'Nouvelle question' : 'Modifier la question'}
        </h2>
        {revision && <p className="auth-subtitle">{revision.sousTitre}</p>}
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {verrouille && (
          <p className="alert alert-info">
            Ce QCM a déjà des tentatives : seule l’explication peut encore être modifiée.
          </p>
        )}
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="q-enonce">
              Énoncé
            </label>
            <textarea
              id="q-enonce"
              className="input"
              rows={3}
              required
              maxLength={4000}
              value={enonce}
              onChange={(e) => setEnonce(e.target.value)}
              disabled={contenuFige}
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="q-type">
                Type
              </label>
              <select
                id="q-type"
                className="input"
                value={type}
                onChange={(e) => changerType(e.target.value as TypeQuestion)}
                disabled={contenuFige}
              >
                {(Object.keys(LIBELLES_TYPE_QUESTION) as TypeQuestion[]).map((t) => (
                  <option key={t} value={t}>
                    {LIBELLES_TYPE_QUESTION[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="q-ponderation">
                Pondération
              </label>
              <input
                id="q-ponderation"
                className="input"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                required
                value={ponderation}
                onChange={(e) => setPonderation(e.target.value)}
                disabled={contenuFige}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="q-niveau">
                Difficulté
              </label>
              <select
                id="q-niveau"
                className="input"
                value={niveau}
                onChange={(e) => setNiveau(e.target.value as NiveauDifficulte | '')}
                disabled={contenuFige}
              >
                <option value="">Non précisée</option>
                {(Object.keys(LIBELLES_NIVEAU) as NiveauDifficulte[]).map((n) => (
                  <option key={n} value={n}>
                    {LIBELLES_NIVEAU[n]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="options-saisie" disabled={contenuFige}>
            <legend className="field-label">
              Options — {choixUnique ? 'cochez LA bonne réponse' : 'cochez LES bonnes réponses'}
            </legend>
            {options.map((o, index) => (
              <div key={index} className="option-ligne">
                <input
                  type={choixUnique ? 'radio' : 'checkbox'}
                  name="bonne-reponse"
                  aria-label={`Option ${index + 1} correcte`}
                  checked={o.estCorrecte}
                  onChange={() => marquer(index)}
                />
                <input
                  className="input"
                  placeholder={`Option ${index + 1}`}
                  maxLength={1000}
                  value={o.texte}
                  readOnly={type === 'VRAI_FAUX'}
                  onChange={(e) =>
                    setOptions(
                      options.map((x, i) => (i === index ? { ...x, texte: e.target.value } : x)),
                    )
                  }
                />
                {type !== 'VRAI_FAUX' && (
                  <button
                    type="button"
                    className="btn-sm btn-icon btn-danger"
                    aria-label={`Retirer l’option ${index + 1}`}
                    onClick={() => setOptions(options.filter((_, i) => i !== index))}
                    disabled={options.length <= 2}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {type !== 'VRAI_FAUX' && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => setOptions([...options, { texte: '', estCorrecte: false }])}
                disabled={options.length >= MAX_OPTIONS}
              >
                + Ajouter une option
              </button>
            )}
          </fieldset>

          <div className="field">
            <label className="field-label" htmlFor="q-explication">
              Explication (montrée à l’apprenant après sa tentative)
            </label>
            <textarea
              id="q-explication"
              className="input"
              rows={2}
              maxLength={4000}
              value={explication}
              onChange={(e) => setExplication(e.target.value)}
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
              {enCours
                ? 'Enregistrement…'
                : revision
                  ? revision.libelleEnvoi
                  : creation
                    ? 'Ajouter'
                    : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

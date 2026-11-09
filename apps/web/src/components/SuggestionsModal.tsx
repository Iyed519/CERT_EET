'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  accepterSuggestion,
  AdminError,
  GenerationIa,
  getQcmsDuModule,
  getSuggestionsGeneration,
  QcmResume,
  QuestionInput,
  QuestionQcm,
  rejeterSuggestion,
  StatutSuggestion,
  SuggestionQuestion,
} from '../lib/api';
import { LIBELLES_STATUT_QCM, LIBELLES_TYPE_GENERABLE } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';
import { QuestionModal } from './QuestionModal';

/** Niveau de confiance lisible (score 0–1 du modèle). */
function confiance(score: number | null): { libelle: string; classe: string } | null {
  if (score === null) return null;
  const libelle = `Confiance ${Math.round(score * 100)} %`;
  if (score >= 0.75) return { libelle, classe: 'confiance-haute' };
  if (score >= 0.5) return { libelle, classe: 'confiance-moyenne' };
  return { libelle, classe: 'confiance-basse' };
}

const LIBELLES_DECISION: Record<Exclude<StatutSuggestion, 'PROPOSEE'>, string> = {
  ACCEPTEE: 'Acceptée',
  MODIFIEE: 'Acceptée après modification',
  REJETEE: 'Rejetée',
};

/** La suggestion sous la forme attendue par l'éditeur de question (pré-remplissage). */
function versQuestion(s: SuggestionQuestion, niveau: GenerationIa['niveau']): QuestionQcm {
  return {
    id: '',
    enonce: s.enonce,
    type: s.type,
    ponderation: 1,
    explication: s.explication,
    niveauDifficulte: niveau,
    origine: 'IA',
    ordre: s.ordre,
    options: s.options.map((o, i) => ({ id: String(i), texte: o.texte, estCorrecte: o.estCorrecte, ordre: i + 1 })),
  };
}

/**
 * US-IA-03 / US-IA-04 — Suggestions d'une génération terminée et leur
 * révision humaine (DS-06 P3). Chaque question proposée montre son énoncé,
 * ses options (bonnes réponses marquées), l'explication, la confiance et les
 * passages du support utilisés ; le formateur choisit le QCM du module qui la
 * recevra puis l'accepte telle quelle, la modifie avant de l'accepter (même
 * saisie que l'éditeur de QCM) ou la rejette (motif facultatif). Une décision
 * est définitive ; rien n'entre dans un QCM sans elle.
 */
export function SuggestionsModal({
  generation,
  modifiable,
  onClose,
  onDecision,
}: {
  generation: GenerationIa;
  modifiable: boolean;
  onClose: () => void;
  onDecision: () => void;
}): JSX.Element {
  const [suggestions, setSuggestions] = useState<SuggestionQuestion[] | null>(null);
  const [qcms, setQcms] = useState<QcmResume[] | null>(null);
  const [qcmId, setQcmId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<SuggestionQuestion | null>(null);
  const [aRejeter, setARejeter] = useState<string | null>(null);
  const [motif, setMotif] = useState('');

  useEffect(() => {
    let actif = true;
    Promise.all([getSuggestionsGeneration(generation.id), getQcmsDuModule(generation.moduleId)])
      .then(([liste, qcmsModule]) => {
        if (!actif) return;
        setSuggestions(liste);
        setQcms(qcmsModule);
        const prefere = qcmsModule.find((q) => q.statut === 'BROUILLON') ?? qcmsModule[0];
        setQcmId(prefere?.id ?? '');
      })
      .catch((error) => {
        if (actif) {
          setErreur(
            error instanceof AdminError ? error.message : 'Impossible de charger les suggestions.',
          );
        }
      });
    return () => {
      actif = false;
    };
  }, [generation.id, generation.moduleId]);

  const aTraiter = useMemo(
    () => (suggestions ?? []).filter((s) => s.statut === 'PROPOSEE').length,
    [suggestions],
  );
  const n = suggestions?.length ?? 0;
  const invalides = generation.nbInvalides ?? 0;
  const qcmChoisi = qcms?.find((q) => q.id === qcmId) ?? null;

  const remplacer = (s: SuggestionQuestion): void =>
    setSuggestions((liste) => (liste ?? []).map((x) => (x.id === s.id ? s : x)));

  const agir = async (id: string, action: () => Promise<SuggestionQuestion>): Promise<void> => {
    setEnCours(id);
    setErreur(null);
    try {
      remplacer(await action());
      onDecision();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Action impossible.');
    } finally {
      setEnCours(null);
    }
  };

  const accepter = (s: SuggestionQuestion): Promise<void> =>
    agir(s.id, async () => (await accepterSuggestion(s.id, qcmId)).suggestion);

  const confirmerRejet = async (s: SuggestionQuestion): Promise<void> => {
    await agir(s.id, () => rejeterSuggestion(s.id, motif.trim() || undefined));
    setARejeter(null);
    setMotif('');
  };

  const envoyerModification = async (corps: QuestionInput): Promise<void> => {
    if (!aModifier) return;
    // Les erreurs remontent à la modale de saisie, qui affiche le message du serveur.
    const r = await accepterSuggestion(aModifier.id, qcmId, corps);
    remplacer(r.suggestion);
    onDecision();
  };

  const actions = modifiable && qcms !== null;

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="sugg-titre">
      <section className="profil-card modal-closable suggestions-card">
        <CroixFermeture onClose={onClose} disabled={enCours !== null} />
        <h2 className="auth-title" id="sugg-titre">
          Questions proposées
        </h2>
        <p className="auth-subtitle">
          Source : « {generation.support.titre} »
          {generation.modeleLlm ? ` · ${generation.modeleLlm}` : ''}. Aucune question n’entre dans un
          QCM sans votre décision.
        </p>
        {invalides > 0 && (
          <p className="field-hint">
            {invalides} proposition{invalides > 1 ? 's' : ''} non conforme
            {invalides > 1 ? 's ont été écartées' : ' a été écartée'} automatiquement.
          </p>
        )}

        {actions && n > 0 && (
          <div className="suggestions-cible">
            {qcms.length === 0 ? (
              <p className="alert alert-info">
                Créez d’abord un QCM dans ce module pour y ajouter les questions acceptées. Vous
                pouvez déjà rejeter celles qui ne conviennent pas.
              </p>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor="sugg-qcm">
                  QCM qui reçoit les questions acceptées
                </label>
                <select
                  id="sugg-qcm"
                  className="input"
                  value={qcmId}
                  disabled={enCours !== null}
                  onChange={(e) => setQcmId(e.target.value)}
                >
                  {qcms.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.titre} · {LIBELLES_STATUT_QCM[q.statut]} · {q.nbQuestions} question
                      {q.nbQuestions > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="field-hint suggestions-compteur">
              {aTraiter === 0
                ? 'Toutes les suggestions ont été traitées.'
                : `${aTraiter} suggestion${aTraiter > 1 ? 's' : ''} à traiter sur ${n}.`}
            </p>
          </div>
        )}

        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {suggestions === null && erreur === null && <p className="field-hint">Chargement…</p>}
        {suggestions !== null && n === 0 && (
          <p className="field-hint">Aucune suggestion pour cette génération.</p>
        )}
        {n > 0 && (
          <ol className="suggestions-liste">
            {suggestions?.map((s) => {
              const c = confiance(s.scoreConfiance);
              const decidee = s.statut !== 'PROPOSEE';
              const occupe = enCours !== null;
              return (
                <li
                  key={s.id}
                  className={`suggestion${decidee ? ` suggestion-decidee suggestion-${s.statut}` : ''}`}
                >
                  <div className="suggestion-tete">
                    <span className="suggestion-numero">{s.ordre}</span>
                    <span className="suggestion-type">{LIBELLES_TYPE_GENERABLE[s.type]}</span>
                    {decidee ? (
                      <span className={`suggestion-statut statut-${s.statut}`}>
                        {LIBELLES_DECISION[s.statut as Exclude<StatutSuggestion, 'PROPOSEE'>]}
                      </span>
                    ) : (
                      c && <span className={`suggestion-confiance ${c.classe}`}>{c.libelle}</span>
                    )}
                  </div>
                  <p className="suggestion-enonce">{s.enonce}</p>
                  <ul className="suggestion-options">
                    {s.options.map((o, i) => (
                      <li
                        key={i}
                        className={o.estCorrecte ? 'suggestion-option correcte' : 'suggestion-option'}
                      >
                        <span className="suggestion-marque" aria-hidden="true">
                          {o.estCorrecte ? '✓' : '○'}
                        </span>
                        <span>
                          {o.texte}
                          {o.estCorrecte && <span className="sr-only"> (bonne réponse)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.explication && <p className="suggestion-explication">{s.explication}</p>}
                  {s.passagesSources.length > 0 && (
                    <p className="field-hint">
                      Passage{s.passagesSources.length > 1 ? 's' : ''} du support :{' '}
                      {s.passagesSources.join(', ')}
                    </p>
                  )}
                  {s.statut === 'REJETEE' && s.motifRejet && (
                    <p className="field-hint">Motif : {s.motifRejet}</p>
                  )}
                  {(s.statut === 'ACCEPTEE' || s.statut === 'MODIFIEE') && (
                    <p className="field-hint">
                      {s.questionId
                        ? `Ajoutée au QCM « ${qcms?.find((q) => q.id === s.qcmId)?.titre ?? 'du module'} ».`
                        : 'La question a depuis été retirée du QCM.'}
                    </p>
                  )}

                  {actions && !decidee && aRejeter !== s.id && (
                    <div className="suggestion-actions">
                      <button
                        type="button"
                        className="btn-sm btn-primary-sm"
                        disabled={occupe || !qcmChoisi}
                        onClick={() => void accepter(s)}
                      >
                        {enCours === s.id ? 'Ajout…' : 'Accepter'}
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        disabled={occupe || !qcmChoisi}
                        onClick={() => setAModifier(s)}
                      >
                        Modifier puis accepter
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-danger"
                        disabled={occupe}
                        onClick={() => {
                          setARejeter(s.id);
                          setMotif('');
                        }}
                      >
                        Rejeter
                      </button>
                    </div>
                  )}
                  {actions && !decidee && aRejeter === s.id && (
                    <div className="suggestion-rejet">
                      <label className="field-label" htmlFor={`motif-${s.id}`}>
                        Motif du rejet (facultatif)
                      </label>
                      <input
                        id={`motif-${s.id}`}
                        className="input"
                        maxLength={500}
                        value={motif}
                        disabled={occupe}
                        placeholder="ex. : hors sujet, doublon, ambiguë"
                        onChange={(e) => setMotif(e.target.value)}
                      />
                      <div className="suggestion-actions">
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={occupe}
                          onClick={() => setARejeter(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="btn-sm btn-danger"
                          disabled={occupe}
                          onClick={() => void confirmerRejet(s)}
                        >
                          {enCours === s.id ? 'Rejet…' : 'Confirmer le rejet'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={enCours !== null}>
            Fermer
          </button>
        </div>
      </section>

      {aModifier && qcmChoisi && (
        <QuestionModal
          qcmId={qcmChoisi.id}
          question={versQuestion(aModifier, generation.niveau)}
          verrouille={false}
          onClose={() => setAModifier(null)}
          onEnregistree={() => setAModifier(null)}
          revision={{
            titre: 'Modifier puis accepter',
            sousTitre: `La question sera ajoutée au QCM « ${qcmChoisi.titre} », marquée « IA modifiée ».`,
            libelleEnvoi: 'Accepter la version modifiée',
            envoyer: envoyerModification,
          }}
        />
      )}
    </div>
  );
}

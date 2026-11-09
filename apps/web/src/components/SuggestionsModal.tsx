'use client';
import { useEffect, useState } from 'react';
import { AdminError, GenerationIa, getSuggestionsGeneration, SuggestionQuestion } from '../lib/api';
import { LIBELLES_TYPE_GENERABLE } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/** Niveau de confiance lisible (score 0–1 du modèle). */
function confiance(score: number | null): { libelle: string; classe: string } | null {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (score >= 0.75) return { libelle: `Confiance ${pct} %`, classe: 'confiance-haute' };
  if (score >= 0.5) return { libelle: `Confiance ${pct} %`, classe: 'confiance-moyenne' };
  return { libelle: `Confiance ${pct} %`, classe: 'confiance-basse' };
}

/**
 * US-IA-03 — Suggestions de questions d'une génération terminée, en lecture :
 * énoncé, options (bonnes réponses marquées), explication, confiance et
 * passages du support utilisés. La relecture (accepter, modifier, rejeter)
 * arrive avec US-IA-04 ; rien n'est publié sans elle.
 */
export function SuggestionsModal({
  generation,
  onClose,
}: {
  generation: GenerationIa;
  onClose: () => void;
}): JSX.Element {
  const [suggestions, setSuggestions] = useState<SuggestionQuestion[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    getSuggestionsGeneration(generation.id)
      .then((liste) => actif && setSuggestions(liste))
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
  }, [generation.id]);

  const n = suggestions?.length ?? 0;
  const invalides = generation.nbInvalides ?? 0;

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="sugg-titre">
      <section className="profil-card modal-closable suggestions-card">
        <CroixFermeture onClose={onClose} disabled={false} />
        <h2 className="auth-title" id="sugg-titre">
          Questions proposées
        </h2>
        <p className="auth-subtitle">
          Source : « {generation.support.titre} »
          {generation.modeleLlm ? ` · ${generation.modeleLlm}` : ''}. Aucune question n’est
          publiée sans votre validation.
        </p>
        {invalides > 0 && (
          <p className="field-hint">
            {invalides} proposition{invalides > 1 ? 's' : ''} non conforme
            {invalides > 1 ? 's ont été écartées' : ' a été écartée'} automatiquement.
          </p>
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
              return (
                <li key={s.id} className="suggestion">
                  <div className="suggestion-tete">
                    <span className="suggestion-numero">{s.ordre}</span>
                    <span className="suggestion-type">{LIBELLES_TYPE_GENERABLE[s.type]}</span>
                    {c && <span className={`suggestion-confiance ${c.classe}`}>{c.libelle}</span>}
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
                </li>
              );
            })}
          </ol>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </section>
    </div>
  );
}

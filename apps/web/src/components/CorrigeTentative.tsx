import type { CorrectionTentative, QuestionCorrigee } from '../lib/api';
import { CONSIGNES_TYPE_QUESTION, pointsFr, scoreFr } from '../lib/format';

/** Verdict d'une question, en texte (jamais la couleur seule). */
const verdict = (question: QuestionCorrigee): { cle: string; libelle: string } => {
  if (!question.repondue) return { cle: 'VIDE', libelle: 'Sans réponse' };
  return question.estCorrecte
    ? { cle: 'JUSTE', libelle: 'Juste' }
    : { cle: 'FAUX', libelle: 'Faux' };
};

/**
 * US-QCM-09 — Corrigé d'une tentative notée, tel que le serveur le renvoie :
 * questions dans l'ordre du tirage, options dans l'ordre tiré. Pour chaque
 * question : juste / faux et points (ce que la notation a écrit), ma réponse,
 * la ou les bonnes réponses, l'explication du formateur. Affichage seul : rien
 * n'est recalculé dans le navigateur.
 *
 * Chaque marque est doublée d'un texte (« Votre réponse », « Bonne réponse »)
 * pour ne jamais dépendre de la couleur seule.
 */
export function CorrigeTentative({ corrige }: { corrige: CorrectionTentative }): JSX.Element {
  const total = corrige.questions.length;
  return (
    <section className="corrige" aria-labelledby="corrige-titre">
      <div className="corrige-entete">
        <h2 id="corrige-titre" className="section-title">
          Corrigé
        </h2>
        <p className="field-hint">
          {corrige.nbCorrectes} question{corrige.nbCorrectes > 1 ? 's' : ''} juste
          {corrige.nbCorrectes > 1 ? 's' : ''} sur {corrige.nbQuestions} · score{' '}
          {scoreFr(corrige.score)} · seuil de réussite {scoreFr(corrige.scoreMinValidation)}
        </p>
      </div>

      {total === 0 ? (
        <p className="page-subtitle">Aucune question dans cette tentative.</p>
      ) : (
        <ol className="passage-questions">
          {corrige.questions.map((question, index) => {
            const { cle, libelle } = verdict(question);
            return (
              <li key={question.id} className={`passage-question corrige-question-${cle}`}>
                <div className="passage-legende">
                  <span className="passage-numero">
                    Question {index + 1} / {total}
                  </span>
                  <span className="corrige-resultat">
                    <span className={`statut-badge corrige-verdict-${cle}`}>{libelle}</span>
                    <span className="corrige-points">
                      {pointsFr(question.pointsObtenus, question.ponderation)}
                    </span>
                  </span>
                </div>
                <p className="passage-enonce">{question.enonce}</p>
                <p className="passage-consigne corrige-consigne">
                  {CONSIGNES_TYPE_QUESTION[question.type]}
                </p>
                <ul className="passage-options">
                  {question.options.map((option) => {
                    const classes = [
                      'corrige-option',
                      option.estCorrecte ? 'corrige-option-correcte' : '',
                      option.cochee && !option.estCorrecte ? 'corrige-option-fausse' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <li key={option.id} className={classes}>
                        <span className="corrige-marque" aria-hidden="true">
                          {option.estCorrecte ? '✓' : option.cochee ? '✗' : ''}
                        </span>
                        <span className="corrige-texte">{option.texte}</span>
                        {(option.cochee || option.estCorrecte) && (
                          <span className="corrige-etiquettes">
                            {option.cochee && (
                              <span className="corrige-etiquette">Votre réponse</span>
                            )}
                            {option.estCorrecte && (
                              <span className="corrige-etiquette corrige-etiquette-bonne">
                                Bonne réponse
                              </span>
                            )}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {question.explication && (
                  <p className="corrige-explication">
                    <strong>Explication :</strong> {question.explication}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

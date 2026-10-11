'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { QcmInfosModal } from '../../../../components/QcmInfosModal';
import { QuestionModal } from '../../../../components/QuestionModal';
import {
  AdminError,
  deleteQcm,
  deleteQuestion,
  getQcm,
  QcmDetail,
  QuestionQcm,
  reorderQuestions,
} from '../../../../lib/api';
import {
  LIBELLES_NIVEAU,
  LIBELLES_STATUT_QCM,
  LIBELLES_TYPE_QUESTION,
} from '../../../../lib/format';

/** Ce qui est ouvert par-dessus la page (une modale à la fois). */
type Fenetre =
  | { type: 'infos' }
  | { type: 'question'; question: QuestionQcm | null }
  | { type: 'retirer'; question: QuestionQcm }
  | { type: 'supprimer' }
  | null;

/**
 * US-QCM-01 — Éditeur d'un QCM (formateur affecté, DS-12 parties 1 et 2).
 *
 * Questions dans l'ordre avec leurs options et les bonnes réponses (✓),
 * ajout / modification / retrait / déplacement. Dès qu'un apprenant a fait une
 * tentative, le contenu est figé : seule l'explication d'une question (et le
 * titre du QCM) peut encore changer — le serveur l'impose, la page le montre.
 * La configuration anti-fraude et la publication arrivent avec US-QCM-03/04.
 */
export default function EditeurQcmPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qcmId = params?.id ?? '';
  const [qcm, setQcm] = useState<QcmDetail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [deplacement, setDeplacement] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    if (!qcmId) return;
    setErreur(null);
    try {
      setQcm(await getQcm(qcmId));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger le QCM.');
    } finally {
      setChargement(false);
    }
  }, [qcmId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const deplacer = async (index: number, sens: -1 | 1): Promise<void> => {
    if (!qcm) return;
    const ids = qcm.questions.map((q) => q.id);
    [ids[index], ids[index + sens]] = [ids[index + sens], ids[index]];
    setDeplacement(true);
    setErreur(null);
    try {
      setQcm(await reorderQuestions(qcm.id, ids));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de déplacer la question.');
    } finally {
      setDeplacement(false);
    }
  };

  const fermerEtRecharger = (): void => {
    setFenetre(null);
    void charger();
  };

  const fige = qcm?.verrouille ?? false;
  const suppressible = qcm !== null && !qcm.verrouille && qcm.statut !== 'PUBLIE';

  return (
    <>
      {qcm && (
        <p className="back-link-row">
          <Link className="back-link" href={`/formateur/formations/${qcm.formationId}`}>
            ← Retour à la formation
          </Link>
        </p>
      )}

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : qcm === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{qcm.titre}</h1>
              <p className="page-subtitle">
                {qcm.description ?? 'Sans description'} · {qcm.nbQuestions} question
                {qcm.nbQuestions > 1 ? 's' : ''}
              </p>
            </div>
            <div className="row-actions">
              <span className={`statut-badge statut-${qcm.statut}`}>
                {LIBELLES_STATUT_QCM[qcm.statut]}
              </span>
              <button className="btn-sm" onClick={() => setFenetre({ type: 'infos' })}>
                Modifier le titre
              </button>
              <button
                className="btn-sm btn-danger"
                onClick={() => setFenetre({ type: 'supprimer' })}
                disabled={!suppressible}
                title={suppressible ? undefined : 'Un QCM publié ou déjà tenté ne se supprime pas.'}
              >
                Supprimer le QCM
              </button>
            </div>
          </div>

          {fige ? (
            <p className="alert alert-info">
              Des apprenants ont déjà passé ce QCM : son contenu est figé. Vous pouvez encore
              compléter les explications des questions.
            </p>
          ) : (
            <p className="field-hint espace-bas">
              Prochaine étape, une fois les questions prêtes : les paramètres anti-fraude et la
              publication (bientôt disponibles).
            </p>
          )}

          <div className="section-tete">
            <h2 className="section-title">Questions</h2>
            <button
              className="btn-sm btn-primary-sm"
              onClick={() => setFenetre({ type: 'question', question: null })}
              disabled={fige}
            >
              + Ajouter une question
            </button>
          </div>

          {qcm.questions.length === 0 ? (
            <p className="page-subtitle">
              Aucune question pour l’instant. Ajoutez-en au moins une : choix unique, choix
              multiple ou vrai / faux.
            </p>
          ) : (
            <ol className="qcm-questions">
              {qcm.questions.map((q, index) => (
                <li key={q.id} className="qcm-question">
                  <div className="qcm-question-tete">
                    <span className="module-ordre">{q.ordre}</span>
                    <div className="module-corps">
                      <div className="qcm-question-meta">
                        <span className="statut-badge type-question">
                          {LIBELLES_TYPE_QUESTION[q.type]}
                        </span>
                        <span className="muted-cell">
                          Pondération {q.ponderation}
                          {q.niveauDifficulte ? ` · ${LIBELLES_NIVEAU[q.niveauDifficulte]}` : ''}
                        </span>
                      </div>
                      <div className="qcm-enonce">{q.enonce}</div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="btn-sm btn-icon"
                        aria-label="Monter la question"
                        onClick={() => void deplacer(index, -1)}
                        disabled={fige || deplacement || index === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="btn-sm btn-icon"
                        aria-label="Descendre la question"
                        onClick={() => void deplacer(index, 1)}
                        disabled={fige || deplacement || index === qcm.questions.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        className="btn-sm"
                        onClick={() => setFenetre({ type: 'question', question: q })}
                      >
                        {fige ? 'Explication' : 'Modifier'}
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => setFenetre({ type: 'retirer', question: q })}
                        disabled={fige}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                  <ul className="qcm-options">
                    {q.options.map((o) => (
                      <li
                        key={o.id}
                        className={o.estCorrecte ? 'qcm-option qcm-option-correcte' : 'qcm-option'}
                      >
                        <span aria-hidden="true">{o.estCorrecte ? '✓' : '○'}</span> {o.texte}
                        {o.estCorrecte && <span className="sr-only"> (bonne réponse)</span>}
                      </li>
                    ))}
                  </ul>
                  {q.explication && <p className="qcm-explication">💡 {q.explication}</p>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {qcm && fenetre?.type === 'infos' && (
        <QcmInfosModal qcm={qcm} onClose={() => setFenetre(null)} onEnregistre={fermerEtRecharger} />
      )}
      {qcm && fenetre?.type === 'question' && (
        <QuestionModal
          qcmId={qcm.id}
          question={fenetre.question}
          verrouille={fige}
          onClose={() => setFenetre(null)}
          onEnregistree={fermerEtRecharger}
        />
      )}
      {qcm && fenetre?.type === 'retirer' && (
        <ConfirmationModal
          titre="Retirer la question"
          message={`« ${fenetre.question.enonce} » sera retirée du QCM, avec ses options.`}
          libelleAction="Retirer"
          onClose={() => setFenetre(null)}
          onConfirmer={async () => {
            await deleteQuestion(qcm.id, fenetre.question.id);
            fermerEtRecharger();
          }}
        />
      )}
      {qcm && fenetre?.type === 'supprimer' && (
        <ConfirmationModal
          titre="Supprimer le QCM"
          message={`« ${qcm.titre} » et ses ${qcm.nbQuestions} question(s) seront supprimés définitivement.`}
          libelleAction="Supprimer"
          onClose={() => setFenetre(null)}
          onConfirmer={async () => {
            await deleteQcm(qcm.id);
            router.push(`/formateur/formations/${qcm.formationId}`);
          }}
        />
      )}
    </>
  );
}

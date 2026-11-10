'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BanqueQuestionsModal } from '../../../../components/BanqueQuestionsModal';
import { ConfigurationModal } from '../../../../components/ConfigurationModal';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { QcmInfosModal } from '../../../../components/QcmInfosModal';
import { QuestionModal } from '../../../../components/QuestionModal';
import {
  AdminError,
  deleteQcm,
  deleteQuestion,
  getQcm,
  publishQcm,
  QcmDetail,
  QuestionQcm,
  reorderQuestions,
} from '../../../../lib/api';
import {
  dateHeureFr,
  LIBELLES_AFFICHAGE,
  LIBELLES_NIVEAU,
  LIBELLES_STATUT_QCM,
  LIBELLES_TYPE_QUESTION,
} from '../../../../lib/format';

/** Ce qui est ouvert par-dessus la page (une modale à la fois). */
type Fenetre =
  | { type: 'infos' }
  | { type: 'configuration' }
  | { type: 'question'; question: QuestionQcm | null }
  | { type: 'banque' }
  | { type: 'retirer'; question: QuestionQcm }
  | { type: 'supprimer' }
  | { type: 'publier' }
  | null;

/** Une condition de publication, vérifiée ici pour guider ; le serveur tranche. */
interface Condition {
  ok: boolean;
  libelle: string;
}

/**
 * Conditions de publication (US-QCM-04), dans l'ordre du serveur : au moins
 * une question, une configuration, puis — une fois configuré — un tirage
 * possible et une fermeture encore à venir.
 */
function conditionsDePublication(qcm: QcmDetail, maintenant: number): Condition[] {
  const configuration = qcm.configuration;
  const tirage = configuration?.nbQuestionsTirees ?? null;
  return [
    { ok: qcm.nbQuestions > 0, libelle: 'Au moins une question' },
    { ok: configuration !== null, libelle: 'Paramètres anti-fraude enregistrés' },
    ...(tirage !== null
      ? [
          {
            ok: tirage <= qcm.nbQuestions,
            libelle: `Tirage de ${tirage} question${tirage > 1 ? 's' : ''} possible (${qcm.nbQuestions} au QCM)`,
          },
        ]
      : []),
    ...(configuration !== null
      ? [
          {
            ok: new Date(configuration.dateFermeture).getTime() > maintenant,
            libelle: 'Date de fermeture encore à venir',
          },
        ]
      : []),
  ];
}

/**
 * US-QCM-01 — Éditeur d'un QCM (formateur affecté, DS-12 parties 1 et 2).
 *
 * Questions dans l'ordre avec leurs options et les bonnes réponses (✓),
 * ajout / modification / retrait / déplacement. Dès qu'un apprenant a fait une
 * tentative, le contenu est figé : seule l'explication d'une question (et le
 * titre du QCM) peut encore changer — le serveur l'impose, la page le montre.
 * US-QCM-03 — Section « Paramètres anti-fraude » : résumé de la
 * configuration et modale pour la saisir (BROUILLON -> NON_PUBLIE).
 * US-QCM-04 — Section « Publication » : liste des conditions (cochées ou
 * non), bouton « Publier » avec confirmation ; une fois publié, rappel de la
 * fenêtre. Un QCM publié garde au moins une question et au moins son tirage :
 * le bouton « Retirer » est désactivé quand ce ne serait plus le cas.
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
  const publie = qcm?.statut === 'PUBLIE';
  const conditions = qcm ? conditionsDePublication(qcm, Date.now()) : [];
  const publiable = conditions.every((c) => c.ok);
  // QCM publié : un retrait ne doit laisser ni zéro question, ni moins que le tirage.
  const minimumPublie = Math.max(1, qcm?.configuration?.nbQuestionsTirees ?? 1);
  const retraitBloque = publie && (qcm?.nbQuestions ?? 0) <= minimumPublie;

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

          {fige && (
            <p className="alert alert-info">
              Des apprenants ont déjà passé ce QCM : son contenu est figé. Vous pouvez encore
              compléter les explications des questions et repousser la date de fermeture.
            </p>
          )}

          <div className="section-tete">
            <h2 className="section-title">Paramètres anti-fraude</h2>
            <button
              className={qcm.configuration ? 'btn-sm' : 'btn-sm btn-primary-sm'}
              onClick={() => setFenetre({ type: 'configuration' })}
              disabled={qcm.nbQuestions === 0}
              title={qcm.nbQuestions === 0 ? 'Ajoutez d’abord au moins une question.' : undefined}
            >
              {qcm.configuration ? 'Modifier les paramètres' : 'Configurer'}
            </button>
          </div>
          {qcm.configuration === null ? (
            <p className="page-subtitle espace-bas">
              {qcm.nbQuestions === 0
                ? 'Ajoutez au moins une question, puis configurez la durée, la fenêtre d’ouverture, les tentatives et le seuil de réussite.'
                : 'Pas encore configuré : durée, fenêtre d’ouverture, tentatives, seuil de réussite… Le QCM passera alors « Non publié », prêt à être publié.'}
            </p>
          ) : (
            <dl className="fiche">
              <div>
                <dt>Durée</dt>
                <dd>{qcm.configuration.dureeMaxMinutes} min</dd>
              </div>
              <div>
                <dt>Fenêtre</dt>
                <dd>
                  du {dateHeureFr(qcm.configuration.dateOuverture)}
                  <br />
                  au {dateHeureFr(qcm.configuration.dateFermeture)}
                </dd>
              </div>
              <div>
                <dt>Tentatives</dt>
                <dd>
                  {qcm.configuration.nbTentativesMax} max
                  {qcm.configuration.delaiEntreTentatives > 0
                    ? ` · ${qcm.configuration.delaiEntreTentatives} h entre deux`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Réussite</dt>
                <dd>
                  {qcm.configuration.scoreMinValidation} % · poids{' '}
                  {qcm.configuration.ponderationFormation} %
                </dd>
              </div>
              <div>
                <dt>Randomisation</dt>
                <dd>
                  {[
                    qcm.configuration.randomiserQuestions && 'questions',
                    qcm.configuration.randomiserOptions && 'options',
                    qcm.configuration.nbQuestionsTirees !== null &&
                      `${qcm.configuration.nbQuestionsTirees} tirées sur ${qcm.nbQuestions}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'aucune'}
                </dd>
              </div>
              <div>
                <dt>Résultat</dt>
                <dd>{LIBELLES_AFFICHAGE[qcm.configuration.affichageResultats].split(' (')[0]}</dd>
              </div>
            </dl>
          )}

          <div className="section-tete">
            <h2 className="section-title">Publication</h2>
            {!publie && (
              <button
                className="btn-sm btn-primary-sm"
                onClick={() => setFenetre({ type: 'publier' })}
                disabled={!publiable}
                title={publiable ? undefined : 'Toutes les conditions ci-dessous doivent être remplies.'}
              >
                Publier
              </button>
            )}
          </div>
          {publie && qcm.configuration ? (
            <p className="alert alert-success espace-bas">
              Publié : visible des apprenants inscrits. Ouverture le{' '}
              {dateHeureFr(qcm.configuration.dateOuverture)}, fermeture le{' '}
              {dateHeureFr(qcm.configuration.dateFermeture)}.
            </p>
          ) : (
            <ul className="conditions-publication">
              {conditions.map((c) => (
                <li key={c.libelle} className={c.ok ? 'condition-ok' : 'condition-ko'}>
                  <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span> {c.libelle}
                  <span className="sr-only">{c.ok ? ' (rempli)' : ' (manquant)'}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="section-tete">
            <h2 className="section-title">Questions</h2>
            <div className="section-actions">
              <button
                className="btn-sm"
                onClick={() => setFenetre({ type: 'banque' })}
                disabled={fige}
              >
                Importer depuis ma banque
              </button>
              <button
                className="btn-sm btn-primary-sm"
                onClick={() => setFenetre({ type: 'question', question: null })}
                disabled={fige}
              >
                + Ajouter une question
              </button>
            </div>
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
                        {q.origine !== 'MANUELLE' && (
                          <span
                            className="origine-question"
                            title={
                              q.origine === 'IA'
                                ? 'Proposée par l’IA, acceptée telle quelle'
                                : 'Proposée par l’IA, modifiée par un formateur'
                            }
                          >
                            {q.origine === 'IA' ? 'IA' : 'IA modifiée'}
                          </span>
                        )}
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
                        disabled={fige || retraitBloque}
                        title={
                          retraitBloque
                            ? `QCM publié : il doit garder au moins ${minimumPublie} question${minimumPublie > 1 ? 's' : ''}.`
                            : undefined
                        }
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

      {qcm && fenetre?.type === 'configuration' && (
        <ConfigurationModal
          qcm={qcm}
          onClose={() => setFenetre(null)}
          onEnregistree={fermerEtRecharger}
        />
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
      {qcm && fenetre?.type === 'banque' && (
        <BanqueQuestionsModal
          qcmId={qcm.id}
          onClose={() => setFenetre(null)}
          onImporte={fermerEtRecharger}
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
      {qcm && fenetre?.type === 'publier' && qcm.configuration && (
        <ConfirmationModal
          titre="Publier le QCM"
          message={`« ${qcm.titre} » sera visible des apprenants inscrits à la formation. L’évaluation ouvrira le ${dateHeureFr(qcm.configuration.dateOuverture)} et fermera le ${dateHeureFr(qcm.configuration.dateFermeture)}.`}
          libelleAction="Publier"
          onClose={() => setFenetre(null)}
          onConfirmer={async () => {
            setQcm(await publishQcm(qcm.id));
            setFenetre(null);
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

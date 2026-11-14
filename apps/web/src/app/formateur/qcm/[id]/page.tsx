'use client';
import Link from 'next/link';
import { useMiettes } from '../../../../components/TitrePage';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BanqueQuestionsModal } from '../../../../components/BanqueQuestionsModal';
import { ConfigurationModal } from '../../../../components/ConfigurationModal';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { ImportFichierModal } from '../../../../components/ImportFichierModal';
import { QcmInfosModal } from '../../../../components/QcmInfosModal';
import { QuestionModal } from '../../../../components/QuestionModal';
import { EnTetePage } from '../../../../components/EnTetePage';
import { Etapes } from '../../../../components/Etapes';
import { Icone } from '../../../../components/Icone';
import { MenuActions } from '../../../../components/MenuActions';
import { Onglets, PanneauOnglet } from '../../../../components/Onglets';
import { PastilleStatut } from '../../../../components/PastilleStatut';
import { etapesQcm } from '../../../../lib/ui-regles';
import {
  AdminError,
  deleteQcm,
  deleteQuestion,
  getEvaluationsFormateur,
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
type OngletQcm = 'questions' | 'parametres' | 'tentatives' | 'surveillance';

/** Onglet où se fait une étape du QCM. */
const ongletEtape = (cle: string): OngletQcm =>
  cle === 'questions' ? 'questions' : cle === 'resultats' ? 'tentatives' : 'parametres';

type Fenetre =
  | { type: 'infos' }
  | { type: 'configuration' }
  | { type: 'question'; question: QuestionQcm | null }
  | { type: 'banque' }
  | { type: 'import' }
  | { type: 'retirer'; question: QuestionQcm }
  | { type: 'supprimer' }
  | { type: 'publier' }
  | null;

/**
 * US-UI-05 — L'étape suivante d'un QCM, seule action pleine de l'éditeur :
 * ajouter une question, puis configurer, puis publier ; rien une fois publié.
 */
function etapeSuivanteQcm(
  qcm: Pick<QcmDetail, 'nbQuestions' | 'configuration' | 'statut' | 'verrouille'>,
): 'ajouter' | 'configurer' | 'publier' | null {
  if (qcm.statut === 'PUBLIE') return null;
  if (qcm.nbQuestions === 0) return qcm.verrouille ? null : 'ajouter';
  if (qcm.configuration === null) return 'configurer';
  return 'publier';
}

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
 * US-IA-08 — « Importer depuis un fichier » : l'IA recopie les questions d'un
 * document (fenêtre ImportFichierModal) ; chaque question est relue avant
 * d'entrer dans le QCM.
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
  // US-UX-05 : onglet affiché, questions dépliées, alertes de surveillance du QCM.
  const [onglet, setOnglet] = useState<OngletQcm>('questions');
  const [depliees, setDepliees] = useState<Record<string, boolean>>({});
  const [alertesQcm, setAlertesQcm] = useState<number | null>(null);

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

  // US-UX-05 : alertes de surveillance à examiner pour ce QCM (formateur ; rien sinon).
  useEffect(() => {
    if (!qcmId) return;
    getEvaluationsFormateur()
      .then((e) => setAlertesQcm(e.qcm.find((x) => x.id === qcmId)?.alertesAExaminer ?? 0))
      .catch(() => setAlertesQcm(null));
  }, [qcmId]);

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
  const etape = qcm ? etapeSuivanteQcm(qcm) : null;
  // US-UX-05 : une seule action pleine, celle du bandeau d'étapes ; dans les onglets, les boutons restent secondaires.
  const surveille = qcm?.configuration?.proctoringWebcam ?? false;
  const toutDeplie = qcm !== null && qcm.questions.length > 0 && qcm.questions.every((q) => depliees[q.id]);
  const conditionsParametres = conditions.slice(2).filter((c) => !c.ok);
  const etapes = qcm
    ? etapesQcm({
        nbQuestions: qcm.nbQuestions,
        configure: qcm.configuration !== null,
        parametresBloquants:
          !publie && conditionsParametres.length > 0 ? conditionsParametres.map((c) => c.libelle.toLowerCase()).join(', ') + ' : à corriger' : null,
        publie,
        tentatives: qcm.verrouille,
      })
    : [];

  useMiettes(qcm ? [{ href: `/formateur/formations/${qcm.formationId}`, libelle: 'La formation' }, { libelle: qcm.titre }] : null);
  return (
    <>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : qcm === null ? null : (
        <>
          <EnTetePage
            titre={qcm.titre}
            phrase={
              <>
                Rédigez ou importez les questions, réglez les paramètres anti-fraude, publiez, puis
                suivez les résultats. {qcm.description ? `${qcm.description} · ` : ''}
                {qcm.nbQuestions} question{qcm.nbQuestions > 1 ? 's' : ''}
              </>
            }
            statut={<PastilleStatut statut={qcm.statut} libelle={LIBELLES_STATUT_QCM[qcm.statut]} />}
            actions={
              <MenuActions
                contexte={qcm.titre}
                elements={[
                  { libelle: 'Modifier le titre', icone: 'modifier', onClick: () => setFenetre({ type: 'infos' }) },
                  {
                    libelle: 'Supprimer le QCM',
                    icone: 'supprimer',
                    danger: true,
                    separe: true,
                    desactive: !suppressible,
                    onClick: () => setFenetre({ type: 'supprimer' }),
                  },
                ]}
                note={suppressible ? undefined : 'Un QCM publié ou déjà tenté ne se supprime pas.'}
              />
            }
          />

          {fige && (
            <p className="alert alert-info">
              Des apprenants ont déjà passé ce QCM : son contenu est figé. Vous pouvez encore
              compléter les explications des questions et repousser la date de fermeture.
            </p>
          )}

          <Etapes
            libelle="Parcours du QCM"
            etapes={etapes.map((e) => ({
              libelle: e.libelle,
              etat: e.etat,
              detail: e.detail,
              // L'étape mène à son onglet (rien à cliquer pour l'onglet déjà ouvert).
              onClick:
                ongletEtape(e.cle) === onglet ? undefined : () => setOnglet(ongletEtape(e.cle)),
            }))}
            action={
              etape === 'ajouter' ? (
                <button className="btn-sm btn-primary-sm" onClick={() => setFenetre({ type: 'question', question: null })} disabled={fige}>
                  <Icone nom="ajouter" taille={16} />
                  Saisir une question
                </button>
              ) : etape === 'configurer' ? (
                <button className="btn-sm btn-primary-sm" onClick={() => setFenetre({ type: 'configuration' })}>
                  <Icone nom="parametres" taille={16} />
                  Configurer
                </button>
              ) : etape === 'publier' ? (
                <button
                  className="btn-sm btn-primary-sm"
                  onClick={() => setFenetre({ type: 'publier' })}
                  disabled={!publiable}
                  title={publiable ? undefined : 'Toutes les conditions de publication doivent être remplies.'}
                >
                  <Icone nom="publier" taille={16} />
                  Publier
                </button>
              ) : publie ? (
                <Link className="btn-sm btn-primary-sm btn-lien" href={`/formateur/qcm/${qcm.id}/tentatives`}>
                  <Icone nom="resultats" taille={16} />
                  Voir les tentatives
                </Link>
              ) : null
            }
          />

          <Onglets
            libelle="Sections du QCM"
            idBase="qcm"
            actif={onglet}
            onChange={(o) => setOnglet(o as OngletQcm)}
            onglets={[
              { id: 'questions', libelle: 'Questions', icone: 'qcm', compteur: qcm.nbQuestions },
              { id: 'parametres', libelle: 'Paramètres', icone: 'parametres' },
              { id: 'tentatives', libelle: 'Tentatives et résultats', icone: 'resultats' },
              ...(surveille
                ? [
                    {
                      id: 'surveillance',
                      libelle: 'Surveillance',
                      icone: 'surveillance' as const,
                      compteur: alertesQcm ?? undefined,
                      compteurAlerte: true,
                    },
                  ]
                : []),
            ]}
          />

          {onglet === 'questions' && (
          <PanneauOnglet id="questions" idBase="qcm">
            <div className="section-tete">
              <h2 className="section-title">Questions</h2>
              <MenuActions
                libelle="Ajouter des questions"
                icone="ajouter"
                principal={etape === 'ajouter'}
                note={fige ? 'Contenu figé : des apprenants ont déjà passé ce QCM.' : undefined}
                elements={[
                  { libelle: 'Saisir une question', icone: 'modifier', desactive: fige, onClick: () => setFenetre({ type: 'question', question: null }) },
                  { libelle: 'Importer depuis ma banque', icone: 'banque', desactive: fige, onClick: () => setFenetre({ type: 'banque' }) },
                  { libelle: 'Importer depuis un fichier', icone: 'importer', desactive: fige, onClick: () => setFenetre({ type: 'import' }) },
                  {
                    libelle: 'Générer avec l’IA (supports du module)',
                    icone: 'ia',
                    desactive: fige,
                    href: `/formateur/formations/${qcm.formationId}`,
                    separe: true,
                  },
                ]}
              />
            </div>

            {qcm.questions.length === 0 ? (
              <p className="page-subtitle">
                Aucune question pour l’instant. Ajoutez-en au moins une : choix unique, choix
                multiple ou vrai / faux.
              </p>
            ) : (
              <>
                <p className="questions-outils">
                  <button
                    type="button"
                    className="btn-discret"
                    onClick={() =>
                      setDepliees(
                        toutDeplie ? {} : Object.fromEntries(qcm.questions.map((q) => [q.id, true])),
                      )
                    }
                  >
                    <Icone nom={toutDeplie ? 'chevron-haut' : 'chevron-bas'} taille={16} />
                    {toutDeplie ? 'Tout replier' : 'Tout déplier'}
                  </button>
                </p>
                <ol className="qcm-questions questions-compactes">
                  {qcm.questions.map((q, index) => {
                    const ouverte = depliees[q.id] ?? false;
                    return (
                      <li key={q.id} className={`qcm-question question-compacte${ouverte ? ' question-ouverte' : ''}`}>
                        <div className="qcm-question-tete">
                          <span className="module-ordre">{q.ordre}</span>
                          <button
                            type="button"
                            className="question-bascule"
                            aria-expanded={ouverte}
                            aria-controls={`question-${q.id}`}
                            onClick={() => setDepliees((d) => ({ ...d, [q.id]: !ouverte }))}
                          >
                            <span className="qcm-enonce">{q.enonce}</span>
                            <span className="qcm-question-meta">
                              <span className="statut-badge type-question">{LIBELLES_TYPE_QUESTION[q.type]}</span>
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
                                {` · ${q.options.length} option${q.options.length > 1 ? 's' : ''}`}
                              </span>
                            </span>
                            <Icone nom={ouverte ? 'chevron-haut' : 'chevron-bas'} taille={18} />
                          </button>
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
                            <button className="btn-sm" onClick={() => setFenetre({ type: 'question', question: q })}>
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
                        <div id={`question-${q.id}`} hidden={!ouverte}>
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
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </PanneauOnglet>
          )}

          {onglet === 'parametres' && (
          <PanneauOnglet id="parametres" idBase="qcm">
            <div className="section-tete">
              <h2 className="section-title">Paramètres anti-fraude</h2>
              <button
                className="btn-sm"
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
                  className="btn-sm"
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
          </PanneauOnglet>
          )}

          {onglet === 'tentatives' && (
          <PanneauOnglet id="tentatives" idBase="qcm">
            <div className="section-tete">
              <h2 className="section-title">Tentatives et résultats</h2>
              <Link className="btn-sm btn-lien" href={`/formateur/qcm/${qcm.id}/tentatives`}>
                Voir l’historique
              </Link>
            </div>
            <p className="page-subtitle">
              {publie
                ? fige
                  ? 'Chaque tentative, sa note, son corrigé, son rapport PDF et les alertes de l’IA sont dans l’historique.'
                  : 'Aucune tentative pour l’instant : l’historique se remplira dès que des apprenants passeront le QCM.'
                : 'Les tentatives arriveront une fois le QCM publié.'}
            </p>
          </PanneauOnglet>
          )}

          {surveille && onglet === 'surveillance' && (
            <PanneauOnglet id="surveillance" idBase="qcm">
              <div className="section-tete">
                <h2 className="section-title">Surveillance par caméra</h2>
                <Link className="btn-sm btn-lien" href="/formateur/alertes/surveillance">
                  Voir les alertes de surveillance
                </Link>
              </div>
              <p className="page-subtitle">
                La surveillance par IA est activée sur ce QCM.{' '}
                {alertesQcm === null
                  ? 'Les photos d’anomalie arrivent dans Alertes › Surveillance des QCM.'
                  : alertesQcm > 0
                    ? `${alertesQcm} alerte${alertesQcm > 1 ? 's' : ''} à examiner pour ce QCM.`
                    : 'Aucune alerte à examiner pour ce QCM.'}{' '}
                Le signal apparaît aussi sur chaque tentative concernée dans l’historique.
              </p>
            </PanneauOnglet>
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
      {qcm && fenetre?.type === 'import' && (
        <ImportFichierModal
          qcmId={qcm.id}
          onClose={fermerEtRecharger}
          onAjout={() => void charger()}
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

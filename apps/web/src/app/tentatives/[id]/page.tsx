'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import {
  AdminError,
  enregistrerReponse,
  getTentative,
  PassageRefuse,
  QuestionTentative,
  soumettreTentative,
  TentativeConsultee,
  TentativeSoumise,
} from '../../../lib/api';
import {
  compteAReboursFr,
  CONSIGNES_TYPE_QUESTION,
  dateHeureFr,
  dureeFr,
  LIBELLES_TENTATIVE,
  sansReponseFr,
} from '../../../lib/format';

/** Délai entre le dernier changement sur une question et son enregistrement (D5). */
const DELAI_SAUVEGARDE_MS = 600;

/** État de la sauvegarde d'une question, affiché sous ses options. */
type EtatSauvegarde = 'enregistrement' | 'enregistre' | 'echec';

/** Comment la tentative s'est terminée, vu de cette page. */
type Fin = 'soumise' | 'temps_ecoule' | 'terminee';

/**
 * US-QCM-05 — Page d'une tentative en cours (DS-02, après l'étape 1).
 *
 * Elle survit à un rechargement : tout vient de GET /api/tentatives/:id (D14),
 * pas d'un état gardé dans le navigateur — réponses comprises (US-QCM-07).
 *
 * Le compte à rebours ne fait pas confiance à l'horloge du navigateur : chaque
 * réponse du serveur porte son heure (`maintenant`) ; j'en déduis l'écart avec
 * l'horloge locale, puis je décompte jusqu'à l'échéance fixée par le serveur.
 * Avancer l'heure du poste ne donne pas une seconde de plus. Ce compteur n'est
 * qu'un affichage : c'est le serveur qui refuse une réponse hors délai.
 *
 * US-QCM-06 — Questions dans l'ordre du tirage figé par le serveur, options
 * dans l'ordre tiré ; jamais la bonne réponse.
 *
 * US-QCM-07 — Les champs sont actifs (bouton radio pour un QCU ou un
 * Vrai/Faux, case à cocher pour un QCM). Chaque question est enregistrée
 * 600 ms après son dernier changement (D5), avec son état : « Enregistrement… »,
 * « Enregistré », ou « Non enregistré — Réessayer ». « Soumettre » demande
 * confirmation (questions sans réponse), termine les enregistrements en cours
 * et renvoie ceux qui ont échoué, puis soumet — jamais avec une réponse non
 * enregistrée. À 00:00, ou sur un refus `temps_ecoule` du serveur, la page
 * passe en « Temps écoulé » : les réponses enregistrées sont conservées.
 */
export default function TentativePage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tentativeId = params?.id ?? '';
  const [tentative, setTentative] = useState<TentativeConsultee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Heure du serveur moins heure locale, mesurée à chaque réponse du serveur.
  const [ecart, setEcart] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // Sélection affichée et état de sauvegarde, par question.
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [etats, setEtats] = useState<Record<string, EtatSauvegarde>>({});
  const [fin, setFin] = useState<Fin | null>(null);
  const [soumise, setSoumise] = useState<TentativeSoumise | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  // Valeurs lues par les minuteurs et les promesses (sans attendre un rendu).
  const selectionsRef = useRef<Record<string, string[]>>({});
  const minuteurs = useRef(new Map<string, number>());
  const enVol = useRef(new Map<string, Promise<boolean>>());
  // Numéro de la dernière sauvegarde lancée par question : une réponse
  // ancienne arrivée en retard ne remplace pas l'état de la plus récente.
  const sequences = useRef(new Map<string, number>());
  // Questions dont la dernière sauvegarde a échoué (renvoyées avant la soumission).
  const echecs = useRef(new Set<string>());
  const finRef = useRef<Fin | null>(null);

  const terminer = useCallback((raison: Fin): void => {
    if (finRef.current !== null) return;
    finRef.current = raison;
    setFin(raison);
    minuteurs.current.forEach((id) => window.clearTimeout(id));
    minuteurs.current.clear();
  }, []);

  useEffect(() => {
    if (!tentativeId) return;
    void (async (): Promise<void> => {
      try {
        const vue = await getTentative(tentativeId);
        setEcart(new Date(vue.maintenant).getTime() - Date.now());
        selectionsRef.current = { ...vue.reponses };
        setSelections(selectionsRef.current);
        setEtats(
          Object.fromEntries(Object.keys(vue.reponses).map((id) => [id, 'enregistre' as const])),
        );
        setTentative(vue);
      } catch (error) {
        setErreur(
          error instanceof AdminError ? error.message : 'Impossible de charger cette tentative.',
        );
      }
    })();
  }, [tentativeId]);

  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(minuterie);
  }, []);

  /** Envoie la sélection ACTUELLE d'une question ; vrai si elle est enregistrée. */
  const sauvegarder = useCallback(
    (questionId: string): Promise<boolean> => {
      const numero = (sequences.current.get(questionId) ?? 0) + 1;
      sequences.current.set(questionId, numero);
      const estDerniere = (): boolean => sequences.current.get(questionId) === numero;
      setEtats((e) => ({ ...e, [questionId]: 'enregistrement' }));

      const envoi = (async (): Promise<boolean> => {
        try {
          const vue = await enregistrerReponse(
            tentativeId,
            questionId,
            selectionsRef.current[questionId] ?? [],
          );
          setEcart(new Date(vue.maintenant).getTime() - Date.now());
          if (estDerniere()) {
            echecs.current.delete(questionId);
            setEtats((e) => ({ ...e, [questionId]: 'enregistre' }));
          }
          return true;
        } catch (error) {
          if (error instanceof PassageRefuse && error.tentativeFinie) {
            terminer(error.raison === 'temps_ecoule' ? 'temps_ecoule' : 'terminee');
          }
          if (estDerniere()) {
            echecs.current.add(questionId);
            setEtats((e) => ({ ...e, [questionId]: 'echec' }));
          }
          return false;
        }
      })();
      enVol.current.set(questionId, envoi);
      void envoi.finally(() => {
        if (enVol.current.get(questionId) === envoi) enVol.current.delete(questionId);
      });
      return envoi;
    },
    [tentativeId, terminer],
  );

  /** Changement d'une option : sélection mise à jour, enregistrement 600 ms plus tard. */
  const changer = (question: QuestionTentative, optionId: string, cochee: boolean): void => {
    if (finRef.current !== null) return;
    const actuelles = selectionsRef.current[question.id] ?? [];
    const suivantes =
      question.type === 'QCM'
        ? cochee
          ? [...actuelles.filter((id) => id !== optionId), optionId]
          : actuelles.filter((id) => id !== optionId)
        : [optionId];
    selectionsRef.current = { ...selectionsRef.current, [question.id]: suivantes };
    setSelections(selectionsRef.current);
    setEtats((e) => ({ ...e, [question.id]: 'enregistrement' }));

    const precedent = minuteurs.current.get(question.id);
    if (precedent !== undefined) window.clearTimeout(precedent);
    minuteurs.current.set(
      question.id,
      window.setTimeout(() => {
        minuteurs.current.delete(question.id);
        void sauvegarder(question.id);
      }, DELAI_SAUVEGARDE_MS),
    );
  };

  /**
   * Avant la soumission : envoie tout de suite ce qui attend encore, renvoie
   * ce qui a échoué, puis attend chaque envoi. Vrai si tout est enregistré.
   */
  const toutEnregistrer = async (): Promise<boolean> => {
    for (const [questionId, minuteur] of [...minuteurs.current.entries()]) {
      window.clearTimeout(minuteur);
      minuteurs.current.delete(questionId);
      void sauvegarder(questionId);
    }
    for (const questionId of [...echecs.current]) {
      if (!enVol.current.has(questionId)) void sauvegarder(questionId);
    }
    const resultats = await Promise.all([...enVol.current.values()]);
    return resultats.every(Boolean) && echecs.current.size === 0;
  };

  /** Confirmé dans la modale : une erreur levée ici s'y affiche (message exact). */
  const soumettre = async (): Promise<void> => {
    const ok = await toutEnregistrer();
    if (finRef.current !== null) {
      setConfirmation(false);
      return;
    }
    if (!ok) {
      throw new AdminError(
        'Certaines réponses ne sont pas enregistrées : réessayez-les avant de soumettre.',
      );
    }
    try {
      const resultat = await soumettreTentative(tentativeId);
      setSoumise(resultat);
      terminer('soumise');
      setConfirmation(false);
    } catch (error) {
      if (error instanceof PassageRefuse && error.tentativeFinie) {
        terminer(error.raison === 'temps_ecoule' ? 'temps_ecoule' : 'terminee');
        setConfirmation(false);
        return;
      }
      throw error;
    }
  };

  // Quitter la page avec un enregistrement en attente : le navigateur prévient.
  useEffect(() => {
    const avertir = (event: BeforeUnloadEvent): void => {
      if (finRef.current === null && (minuteurs.current.size > 0 || enVol.current.size > 0)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, []);

  const restant =
    tentative === null ? 0 : new Date(tentative.dateLimite).getTime() - (maintenant + ecart);

  // 00:00 affiché : la page passe en « Temps écoulé » (le serveur refusera de toute façon).
  useEffect(() => {
    if (tentative?.statut === 'EN_COURS' && restant <= 0) terminer('temps_ecoule');
  }, [tentative, restant, terminer]);

  if (erreur !== null) {
    return (
      <>
        <p className="back-link-row">
          <Link className="back-link" href="/mes-inscriptions">
            ← Mes inscriptions
          </Link>
        </p>
        <p className="alert alert-error">{erreur}</p>
      </>
    );
  }
  if (tentative === null) {
    return <p className="page-subtitle">Chargement…</p>;
  }

  const enCours = tentative.statut === 'EN_COURS' && restant > 0 && fin === null;
  const bientotFini = enCours && restant <= 5 * 60_000;
  const nbSansReponse = tentative.questions.filter(
    (q) => (selections[q.id] ?? []).length === 0,
  ).length;
  const estSoumise =
    fin === 'soumise' || tentative.statut === 'SOUMISE' || tentative.statut === 'NOTEE';
  const statutAffiche = enCours
    ? 'EN_COURS'
    : estSoumise
      ? fin === 'soumise'
        ? 'SOUMISE'
        : tentative.statut
      : 'ABANDONNEE_TIMER';
  const lienEspace = `/mes-inscriptions/${tentative.formationId}`;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href={lienEspace}>
          ← Mon espace
        </Link>
      </p>

      <div className="page-head">
        <div>
          <h1 className="page-title">{tentative.qcmTitre}</h1>
          <p className="page-subtitle">
            Tentative {tentative.numero} sur {tentative.nbTentativesMax} · durée{' '}
            {dureeFr(tentative.dureeMaxMinutes)}
          </p>
        </div>
        <span className={`statut-badge tentative-${enCours ? 'EN_COURS' : 'FINIE'}`}>
          {LIBELLES_TENTATIVE[statutAffiche]}
        </span>
      </div>

      <section
        className={`chrono${bientotFini ? ' chrono-alerte' : ''}${enCours ? '' : ' chrono-fini'}`}
        aria-label="Temps restant"
      >
        <span className="chrono-libelle">Temps restant</span>
        <span className="chrono-valeur" role="timer" aria-live="off">
          {compteAReboursFr(enCours ? restant : 0)}
        </span>
        <span className="field-hint">
          Démarrée le {dateHeureFr(tentative.dateDebut)} · fin au plus tard le{' '}
          {dateHeureFr(tentative.dateLimite)}
        </span>
      </section>

      {enCours && (
        <>
          <p className="alert alert-info">
            Vos réponses sont enregistrées automatiquement à chaque changement. Le temps continue de
            courir même si vous quittez cette page : vous pourrez la reprendre depuis votre espace.
          </p>
          {tentative.questions.length === 0 ? (
            <p className="page-subtitle">Aucune question à afficher pour cette tentative.</p>
          ) : (
            <>
              <ol className="passage-questions">
                {tentative.questions.map((question, index) => {
                  const choisies = selections[question.id] ?? [];
                  const etat = etats[question.id];
                  return (
                    <li key={question.id} className="passage-question">
                      <fieldset className="passage-fieldset">
                        <legend className="passage-legende">
                          <span className="passage-numero">
                            Question {index + 1} / {tentative.questions.length}
                          </span>
                          <span className="passage-consigne">
                            {CONSIGNES_TYPE_QUESTION[question.type]}
                          </span>
                        </legend>
                        <p className="passage-enonce">{question.enonce}</p>
                        <ul className="passage-options">
                          {question.options.map((option) => {
                            const cochee = choisies.includes(option.id);
                            return (
                              <li key={option.id}>
                                <label
                                  className={`passage-option${cochee ? ' passage-option-choisie' : ''}`}
                                >
                                  <input
                                    type={question.type === 'QCM' ? 'checkbox' : 'radio'}
                                    name={`question-${question.id}`}
                                    value={option.id}
                                    checked={cochee}
                                    onChange={(event) =>
                                      changer(question, option.id, event.target.checked)
                                    }
                                  />
                                  <span>{option.texte}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                        <p
                          className={`passage-sauvegarde${
                            etat === 'echec' ? ' passage-sauvegarde-echec' : ''
                          }`}
                          aria-live="polite"
                        >
                          {etat === 'enregistrement' && 'Enregistrement…'}
                          {etat === 'enregistre' &&
                            (choisies.length > 0 ? '✓ Enregistré' : 'Réponse effacée')}
                          {etat === 'echec' && (
                            <>
                              Non enregistré —{' '}
                              <button
                                type="button"
                                className="lien-bouton"
                                onClick={() => void sauvegarder(question.id)}
                              >
                                Réessayer
                              </button>
                            </>
                          )}
                        </p>
                      </fieldset>
                    </li>
                  );
                })}
              </ol>

              <div className="passage-soumission">
                <p className="field-hint">
                  {nbSansReponse === 0
                    ? 'Toutes les questions ont une réponse.'
                    : sansReponseFr(nbSansReponse)}
                </p>
                <button type="button" className="btn" onClick={() => setConfirmation(true)}>
                  Soumettre
                </button>
              </div>
            </>
          )}
        </>
      )}

      {!enCours && estSoumise && (
        <section className="passage-fin">
          <h2 className="passage-fin-titre">Tentative soumise</h2>
          <p className="auth-subtitle">
            {soumise
              ? `Soumise le ${dateHeureFr(soumise.dateFin)} · ${soumise.nbReponses} sur ${
                  soumise.nbQuestions
                } question${soumise.nbQuestions > 1 ? 's' : ''} répondue${
                  soumise.nbReponses > 1 ? 's' : ''
                }.`
              : tentative.dateFin
                ? `Soumise le ${dateHeureFr(tentative.dateFin)}.`
                : 'Vos réponses ont été transmises.'}{' '}
            Votre résultat sera disponible dans votre espace.
          </p>
          <Link className="btn passage-fin-lien" href={lienEspace}>
            Retour à mon espace
          </Link>
        </section>
      )}

      {!enCours && !estSoumise && (
        <section className="passage-fin">
          <h2 className="passage-fin-titre">
            {fin === 'terminee' ? 'Tentative terminée' : 'Temps écoulé'}
          </h2>
          <p className="auth-subtitle">
            {fin === 'terminee'
              ? 'Cette tentative est terminée.'
              : 'Vos réponses enregistrées sont conservées.'}{' '}
            Votre résultat sera disponible dans votre espace.
          </p>
          <Link className="btn passage-fin-lien" href={lienEspace}>
            Retour à mon espace
          </Link>
        </section>
      )}

      {confirmation && enCours && (
        <ConfirmationModal
          titre="Soumettre la tentative ?"
          message={`${
            nbSansReponse === 0
              ? 'Toutes les questions ont une réponse.'
              : `Attention : ${sansReponseFr(nbSansReponse)}.`
          } Après la soumission, vous ne pourrez plus modifier vos réponses.`}
          libelleAction="Soumettre"
          onConfirmer={soumettre}
          onClose={() => setConfirmation(false)}
        />
      )}
    </>
  );
}

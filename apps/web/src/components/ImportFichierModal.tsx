'use client';
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  accepterQuestionExtraite,
  AdminError,
  deposerExtraction,
  ExtractionDetail,
  ExtractionQuestions,
  FORMATS_EXTRACTION,
  getExtraction,
  getExtractionsDuQcm,
  QuestionExtraite,
  QuestionInput,
  QuestionQcm,
  rejeterQuestionExtraite,
  relancerExtraction,
  StatutExtraction,
  StatutSuggestion,
  TAILLE_MAX_EXTRACTION,
  toutAccepterExtraction,
  EtatIa,
} from '../lib/api';
import { dateHeureFr, LIBELLES_TYPE_GENERABLE } from '../lib/format';
import { EtatIaAlerte, iaIndisponible } from './EtatIaAlerte';
import { Fenetre } from './Fenetre';
import { QuestionModal } from './QuestionModal';

const LIBELLES_STATUT: Record<StatutExtraction, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'Lecture en cours',
  TERMINEE: 'Terminé',
  ECHEC: 'Échec',
};

const LIBELLES_MODE: Record<string, string> = {
  TEXTE: 'texte du document',
  TABLEAU: 'tableau, une question par ligne',
  VISION: 'lecture visuelle (image ou PDF scanné)',
};

const LIBELLES_DECISION: Record<Exclude<StatutSuggestion, 'PROPOSEE'>, string> = {
  ACCEPTEE: 'Ajoutée au QCM',
  MODIFIEE: 'Ajoutée après modification',
  REJETEE: 'Rejetée',
};

const ACCEPT = FORMATS_EXTRACTION.map((f) => `.${f}`).join(',');

/** Contrôle côté navigateur pour guider ; le serveur vérifie aussi le contenu. */
function controlerFichier(fichier: File): string | null {
  const extension = fichier.name.split('.').pop()?.toLowerCase() ?? '';
  if (!FORMATS_EXTRACTION.includes(extension)) {
    return 'Format non pris en charge : PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPEG ou WEBP.';
  }
  if (fichier.size === 0) return 'Le fichier est vide.';
  if (fichier.size > TAILLE_MAX_EXTRACTION) return 'Le fichier dépasse 10 Mo, la taille maximale.';
  return null;
}

/** La question extraite au format de l'éditeur de question (pré-remplissage). */
function versQuestion(q: QuestionExtraite): QuestionQcm {
  return {
    id: '',
    enonce: q.enonce,
    type: q.type,
    ponderation: 1,
    explication: q.explication,
    niveauDifficulte: q.niveau,
    origine: 'IA',
    ordre: q.ordre,
    options: q.options.map((o, i) => ({
      id: String(i),
      texte: o.texte,
      estCorrecte: o.estCorrecte,
      ordre: i + 1,
    })),
  };
}

const enCours = (s: StatutExtraction): boolean => s === 'EN_ATTENTE' || s === 'EN_COURS';

/**
 * US-IA-08 — Importer des questions depuis un fichier. Trois temps dans la
 * même fenêtre : déposer le document (glisser-déposer ou sélection), suivre
 * la lecture par l'IA (en attente, en cours, terminé, échec + relancer), puis
 * relire chaque question : la modifier, cocher la bonne réponse si le
 * document ne la donnait pas, l'accepter ou la rejeter, ou « tout accepter »
 * les questions complètes. Rien n'entre dans le QCM sans ces décisions.
 */
export function ImportFichierModal({
  qcmId,
  onClose,
  onAjout,
}: {
  qcmId: string;
  onClose: () => void;
  onAjout: () => void;
}): JSX.Element {
  const [historique, setHistorique] = useState<ExtractionQuestions[] | null>(null);
  const [extraction, setExtraction] = useState<ExtractionDetail | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<QuestionExtraite | null>(null);
  const [aRejeter, setARejeter] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const champ = useRef<HTMLInputElement>(null);

  const message = (e: unknown, defaut: string): string => (e instanceof AdminError ? e.message : defaut);

  useEffect(() => {
    getExtractionsDuQcm(qcmId)
      .then(setHistorique)
      .catch((e) => setErreur(message(e, 'Impossible de charger les imports.')));
  }, [qcmId]);

  const ouvrir = useCallback(async (id: string): Promise<void> => {
    setErreur(null);
    try {
      setExtraction(await getExtraction(id));
    } catch (e) {
      setErreur(message(e, 'Impossible de charger l’import.'));
    }
  }, []);

  // Suivi de l'état tant que l'IA lit le document.
  useEffect(() => {
    if (!extraction || !enCours(extraction.statut)) return;
    const minuterie = setTimeout(() => void ouvrir(extraction.id), 2000);
    return () => clearTimeout(minuterie);
  }, [extraction, ouvrir]);

  const choisir = (f: File | undefined): void => {
    setErreur(null);
    if (!f) return;
    const refus = controlerFichier(f);
    if (refus) {
      setFichier(null);
      setErreur(refus);
      return;
    }
    setFichier(f);
  };

  const deposer = async (): Promise<void> => {
    if (!fichier) return;
    setOccupe('depot');
    setErreur(null);
    try {
      const e = await deposerExtraction(qcmId, fichier);
      setFichier(null);
      setExtraction({ ...e, questions: [] });
    } catch (e) {
      setErreur(message(e, 'Impossible de déposer le fichier.'));
    } finally {
      setOccupe(null);
    }
  };

  const relancer = async (): Promise<void> => {
    if (!extraction) return;
    setOccupe('relance');
    setErreur(null);
    try {
      const e = await relancerExtraction(extraction.id);
      setExtraction({ ...e, questions: [] });
    } catch (e) {
      setErreur(message(e, 'Impossible de relancer l’import.'));
    } finally {
      setOccupe(null);
    }
  };

  const remplacer = (q: QuestionExtraite): void =>
    setExtraction((e) => (e ? { ...e, questions: e.questions.map((x) => (x.id === q.id ? q : x)) } : e));

  const agir = async (id: string, action: () => Promise<QuestionExtraite>): Promise<void> => {
    setOccupe(id);
    setErreur(null);
    setInfo(null);
    try {
      remplacer(await action());
      onAjout();
    } catch (e) {
      setErreur(message(e, 'Action impossible.'));
    } finally {
      setOccupe(null);
    }
  };

  const toutAccepter = async (): Promise<void> => {
    if (!extraction) return;
    setOccupe('tout');
    setErreur(null);
    try {
      const r = await toutAccepterExtraction(extraction.id);
      setExtraction(r.extraction);
      setInfo(
        `${r.acceptees} question${r.acceptees > 1 ? 's ajoutées' : ' ajoutée'} au QCM` +
          (r.ignorees > 0 ? `, ${r.ignorees} ignorée${r.ignorees > 1 ? 's' : ''}.` : '.'),
      );
      onAjout();
    } catch (e) {
      setErreur(message(e, 'Impossible d’accepter les questions.'));
    } finally {
      setOccupe(null);
    }
  };

  const envoyerModification = async (corps: QuestionInput): Promise<void> => {
    if (!aModifier) return;
    // Les erreurs remontent à la modale de saisie, qui affiche le message du serveur.
    const r = await accepterQuestionExtraite(aModifier.id, corps);
    remplacer(r.questionExtraite);
    onAjout();
  };

  const surDepot = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setSurvol(false);
    choisir(e.dataTransfer.files?.[0]);
  };

  const questions = extraction?.questions ?? [];
  const [etatIa, setEtatIa] = useState<EtatIa | null>(null);
  const aTraiter = questions.filter((q) => q.statut === 'PROPOSEE');
  const completes = aTraiter.filter((q) => q.reponseConnue).length;
  const bloque = occupe !== null;

  return (
    <>
      <Fenetre
        titre="Importer des questions depuis un fichier"
        sousTitre="Déposez un ancien examen, une banque Excel ou CSV, un sujet Word, un PDF (même scanné) ou la photo d’une feuille : l’IA recopie les questions qu’il contient, sans en inventer. Vous relisez chacune avant qu’elle n’entre dans le QCM."
        onClose={onClose}
        occupe={bloque}
        classe="suggestions-card"
      >

        <EtatIaAlerte onEtat={setEtatIa} />
        {erreur !== null && (
          <p className="alert alert-error" role="alert">
            {erreur}
          </p>
        )}
        {info !== null && <p className="alert alert-success">{info}</p>}

        {extraction === null ? (
          <>
            <div
              className={`import-zone${survol ? ' import-zone-survol' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSurvol(true);
              }}
              onDragLeave={() => setSurvol(false)}
              onDrop={surDepot}
            >
              <p className="import-zone-titre">
                {fichier ? fichier.name : 'Glissez le fichier ici'}
              </p>
              <p className="field-hint">
                PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPEG ou WEBP · 10 Mo au plus
              </p>
              <input
                ref={champ}
                id="import-fichier"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => choisir(e.target.files?.[0])}
              />
              <button type="button" className="btn-sm" onClick={() => champ.current?.click()}>
                Choisir un fichier
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondaire" onClick={onClose} disabled={bloque}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!fichier || bloque || iaIndisponible(etatIa)}
                onClick={() => void deposer()}
              >
                {occupe === 'depot' ? 'Envoi…' : 'Lancer la lecture'}
              </button>
            </div>

            {historique !== null && historique.length > 0 && (
              <div className="import-historique">
                <h3 className="section-title">Imports récents de ce QCM</h3>
                <ul>
                  {historique.map((h) => (
                    <li key={h.id}>
                      <button type="button" className="lien-bouton" onClick={() => void ouvrir(h.id)}>
                        {h.nomFichier}
                      </button>{' '}
                      <span className={`import-statut import-statut-${h.statut}`}>
                        {LIBELLES_STATUT[h.statut]}
                      </span>{' '}
                      <span className="muted-cell">
                        {dateHeureFr(h.dateLancement)}
                        {h.statut === 'TERMINEE' && ` · ${h.nbQuestions ?? 0} question(s)`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="import-etat" aria-live="polite">
              <span className={`import-statut import-statut-${extraction.statut}`}>
                {LIBELLES_STATUT[extraction.statut]}
              </span>
              <span>
                « {extraction.nomFichier} »
                {extraction.modeLecture ? ` · ${LIBELLES_MODE[extraction.modeLecture]}` : ''}
                {extraction.modeleLlm ? ` · ${extraction.modeleLlm}` : ''}
              </span>
            </div>
            {enCours(extraction.statut) && (
              <p className="field-hint">
                L’IA lit le document : cela prend en général moins d’une minute. Vous pouvez fermer
                cette fenêtre, l’import continue et reste listé ici.
              </p>
            )}
            {enCours(extraction.statut) && extraction.derniereErreur && (
              <p className="alert alert-info" role="status">
                Nouvel essai en cours après une erreur : {extraction.derniereErreur}
              </p>
            )}
            {extraction.statut === 'ECHEC' && (
              <div className="alert alert-error">
                <p>{extraction.derniereErreur ?? 'La lecture a échoué.'}</p>
                {extraction.fichierConserve && (
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={bloque}
                    onClick={() => void relancer()}
                  >
                    {occupe === 'relance' ? 'Relance…' : 'Relancer la lecture'}
                  </button>
                )}
              </div>
            )}
            {extraction.statut === 'TERMINEE' && questions.length === 0 && (
              <p className="alert alert-info">
                Aucune question trouvée dans ce document. Vérifiez qu’il contient bien des questions
                avec leurs options, puis déposez un autre fichier.
              </p>
            )}
            {extraction.tronque && (
              <p className="field-hint">
                Document très long : seule sa première partie a été lue. Découpez-le pour importer
                la suite.
              </p>
            )}
            {extraction.statut === 'TERMINEE' && questions.length > 0 && (
              <div className="suggestions-cible">
                <p className="field-hint suggestions-compteur">
                  {aTraiter.length === 0
                    ? 'Toutes les questions ont été traitées.'
                    : `${aTraiter.length} question${aTraiter.length > 1 ? 's' : ''} à relire sur ${questions.length}` +
                      ((extraction.nbEcartees ?? 0) > 0
                        ? ` · ${extraction.nbEcartees} écartée(s), illisible(s) ou incomplète(s)`
                        : '')}
                </p>
                {completes > 0 && (
                  <button
                    type="button"
                    className="btn-sm btn-primary-sm"
                    disabled={bloque}
                    onClick={() => void toutAccepter()}
                  >
                    {occupe === 'tout' ? 'Ajout…' : `Tout accepter (${completes} complète${completes > 1 ? 's' : ''})`}
                  </button>
                )}
              </div>
            )}

            {questions.length > 0 && (
              <ol className="suggestions-liste">
                {questions.map((q) => {
                  const decidee = q.statut !== 'PROPOSEE';
                  return (
                    <li
                      key={q.id}
                      className={`suggestion${decidee ? ` suggestion-decidee suggestion-${q.statut}` : ''}`}
                    >
                      <div className="suggestion-tete">
                        <span className="suggestion-numero">{q.ordre}</span>
                        <span className="suggestion-type">{LIBELLES_TYPE_GENERABLE[q.type]}</span>
                        {decidee ? (
                          <span className={`suggestion-statut statut-${q.statut}`}>
                            {LIBELLES_DECISION[q.statut as Exclude<StatutSuggestion, 'PROPOSEE'>]}
                          </span>
                        ) : (
                          !q.reponseConnue && (
                            <span className="reponse-a-choisir">Bonne réponse à choisir</span>
                          )
                        )}
                      </div>
                      <p className="suggestion-enonce">{q.enonce}</p>
                      <ul className="suggestion-options">
                        {q.options.map((o, i) => (
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
                      {q.explication && <p className="suggestion-explication">{q.explication}</p>}
                      {q.statut === 'REJETEE' && q.motifRejet && (
                        <p className="field-hint">Motif : {q.motifRejet}</p>
                      )}

                      {!decidee && aRejeter !== q.id && (
                        <div className="suggestion-actions">
                          {q.reponseConnue ? (
                            <button
                              type="button"
                              className="btn-sm btn-primary-sm"
                              disabled={bloque}
                              onClick={() =>
                                void agir(q.id, async () => (await accepterQuestionExtraite(q.id)).questionExtraite)
                              }
                            >
                              {occupe === q.id ? 'Ajout…' : 'Accepter'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={q.reponseConnue ? 'btn-sm' : 'btn-sm btn-primary-sm'}
                            disabled={bloque}
                            onClick={() => setAModifier(q)}
                          >
                            {q.reponseConnue ? 'Modifier puis accepter' : 'Choisir la bonne réponse'}
                          </button>
                          <button
                            type="button"
                            className="btn-sm btn-danger"
                            disabled={bloque}
                            onClick={() => {
                              setARejeter(q.id);
                              setMotif('');
                            }}
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                      {!decidee && aRejeter === q.id && (
                        <div className="suggestion-rejet">
                          <label className="field-label" htmlFor={`motif-${q.id}`}>
                            Motif du rejet (facultatif)
                          </label>
                          <input
                            id={`motif-${q.id}`}
                            className="input"
                            maxLength={500}
                            value={motif}
                            disabled={bloque}
                            placeholder="ex. : mal recopiée, doublon, hors programme"
                            onChange={(e) => setMotif(e.target.value)}
                          />
                          <div className="suggestion-actions">
                            <button type="button" className="btn-sm" disabled={bloque} onClick={() => setARejeter(null)}>
                              Annuler
                            </button>
                            <button
                              type="button"
                              className="btn-sm btn-danger"
                              disabled={bloque}
                              onClick={() =>
                                void agir(q.id, () => rejeterQuestionExtraite(q.id, motif.trim() || undefined)).then(
                                  () => setARejeter(null),
                                )
                              }
                            >
                              {occupe === q.id ? 'Rejet…' : 'Confirmer le rejet'}
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
              <button
                type="button"
                className="btn btn-secondaire"
                disabled={bloque || enCours(extraction.statut)}
                onClick={() => {
                  setExtraction(null);
                  setInfo(null);
                  void getExtractionsDuQcm(qcmId).then(setHistorique).catch(() => undefined);
                }}
              >
                Importer un autre fichier
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose} disabled={bloque}>
                Fermer
              </button>
            </div>
          </>
        )}
      </Fenetre>

      {aModifier && (
        <QuestionModal
          qcmId={qcmId}
          question={versQuestion(aModifier)}
          verrouille={false}
          onClose={() => setAModifier(null)}
          onEnregistree={() => setAModifier(null)}
          revision={{
            titre: aModifier.reponseConnue ? 'Modifier puis accepter' : 'Choisir la bonne réponse',
            sousTitre: aModifier.reponseConnue
              ? 'La question sera ajoutée au QCM, marquée « IA modifiée ».'
              : 'Le document ne donnait pas la bonne réponse : cochez-la, puis acceptez. La question sera marquée « IA modifiée ».',
            libelleEnvoi: 'Ajouter au QCM',
            envoyer: envoyerModification,
          }}
        />
      )}
    </>
  );
}

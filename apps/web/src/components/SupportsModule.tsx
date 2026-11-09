'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminError,
  deposerSupport,
  EXTENSIONS_SUPPORT,
  GenerationIa,
  getGenerationsDuModule,
  getSupportsDuModule,
  reindexerSupport,
  SupportPedagogique,
  supprimerSupport,
  TAILLE_MAX_SUPPORT,
} from '../lib/api';
import {
  dateHeureFr,
  LIBELLES_NIVEAU_GENERATION,
  LIBELLES_STATUT_GENERATION,
  LIBELLES_STATUT_SUPPORT,
  tailleFr,
} from '../lib/format';
import { ConfirmationModal } from './ConfirmationModal';
import { CroixFermeture } from './CroixFermeture';
import { GenerationModal } from './GenerationModal';
import { SuggestionsModal } from './SuggestionsModal';

/** Générations affichées sous les supports (les plus récentes). */
const GENERATIONS_AFFICHEES = 5;

/** Ligne d'information d'une génération. */
function detailGeneration(g: GenerationIa): string {
  const types = g.types.map((t) => (t === 'VRAI_FAUX' ? 'Vrai/Faux' : t)).join(', ');
  const base = `${g.nbQuestionsDemandees} question${g.nbQuestionsDemandees > 1 ? 's' : ''} · ${types} · ${LIBELLES_NIVEAU_GENERATION[g.niveau]}`;
  const theme = g.focusThematique ? ` · « ${g.focusThematique} »` : '';
  return `${base}${theme} · lancée le ${dateHeureFr(g.dateLancement)}`;
}

/** Rafraîchissement de la liste tant qu'une indexation est en cours (SSE = US-IA-07). */
const INTERVALLE_SUIVI_MS = 3000;

const extensionDe = (nom: string): string => {
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(point + 1).toLowerCase() : '';
};

/** Ligne d'information sous le titre d'un support. */
function detailSupport(s: SupportPedagogique): string {
  const base = `${s.extension.toUpperCase()} · ${tailleFr(s.tailleOctets)}`;
  if (s.statut === 'INDEXE') {
    const n = s.nbSegments ?? 0;
    return `${base} · ${n} passage${n > 1 ? 's' : ''} · indexé le ${dateHeureFr(s.dateIndexation as string)}`;
  }
  if (s.statut === 'EN_INDEXATION') return `${base} · déposé le ${dateHeureFr(s.dateDepot)}`;
  return base;
}

/**
 * US-IA-01 — Supports pédagogiques d'un module, sources de la génération de
 * questions par IA (DS-06 partie 1, UC10 Formateur).
 *
 * Liste avec l'état d'indexation ; la liste se rafraîchit seule tant qu'un
 * support est en cours d'indexation. Dépôt (PDF, PPTX, DOCX, TXT, MD,
 * 20 Mo au plus), relance d'une indexation en échec, suppression. Le serveur
 * revérifie tout et son message s'affiche tel quel.
 *
 * US-IA-02 — « Générer » sur un support indexé ouvre le paramétrage d'une
 * génération ; les dernières générations du module s'affichent dessous avec
 * leur état (la liste se rafraîchit tant qu'une génération est en cours).
 */
export function SupportsModule({
  moduleId,
  moduleTitre,
  modifiable,
}: {
  moduleId: string;
  moduleTitre: string;
  modifiable: boolean;
}): JSX.Element {
  const [supports, setSupports] = useState<SupportPedagogique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depot, setDepot] = useState(false);
  const [aSupprimer, setASupprimer] = useState<SupportPedagogique | null>(null);
  const [relanceEnCours, setRelanceEnCours] = useState<string | null>(null);
  const [generations, setGenerations] = useState<GenerationIa[]>([]);
  const [aGenerer, setAGenerer] = useState<SupportPedagogique | null>(null);
  const [aConsulter, setAConsulter] = useState<GenerationIa | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      const [listeSupports, listeGenerations] = await Promise.all([
        getSupportsDuModule(moduleId),
        getGenerationsDuModule(moduleId),
      ]);
      setSupports(listeSupports);
      setGenerations(listeGenerations);
      setErreur(null);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les supports.');
    }
  }, [moduleId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const enCours =
    (supports ?? []).some((s) => s.statut === 'EN_INDEXATION') ||
    generations.some((g) => g.statut === 'EN_COURS');
  useEffect(() => {
    if (!enCours) return;
    const minuterie = window.setInterval(() => void charger(), INTERVALLE_SUIVI_MS);
    return () => window.clearInterval(minuterie);
  }, [enCours, charger]);

  const relancer = async (s: SupportPedagogique): Promise<void> => {
    setRelanceEnCours(s.id);
    setErreur(null);
    try {
      await reindexerSupport(s.id);
      await charger();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de relancer l’indexation.');
    } finally {
      setRelanceEnCours(null);
    }
  };

  return (
    <div className="supports-module">
      <div className="supports-tete">
        <span className="supports-titre">Supports pour l’IA</span>
        {modifiable && (
          <button className="btn-sm" onClick={() => setDepot(true)}>
            + Support
          </button>
        )}
      </div>
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {supports === null ? null : supports.length === 0 ? (
        <p className="espace-vide">
          Aucun support : déposez un cours (PDF, PPTX, DOCX, TXT ou MD) pour générer des questions.
        </p>
      ) : (
        <ul className="espace-qcms">
          {supports.map((s) => (
            <li key={s.id} className="espace-qcm support-ligne">
              <div className="module-corps">
                <div className="espace-qcm-titre">Support · {s.titre}</div>
                <div className="field-hint">{detailSupport(s)}</div>
                {s.statut === 'ECHEC_INDEXATION' && s.derniereErreur && (
                  <div className="support-erreur">{s.derniereErreur}</div>
                )}
              </div>
              <span className={`statut-badge support-${s.statut}`}>
                {LIBELLES_STATUT_SUPPORT[s.statut]}
              </span>
              {modifiable && (
                <div className="support-actions">
                  {s.statut === 'INDEXE' && (
                    <button className="btn-sm btn-primary-sm" onClick={() => setAGenerer(s)}>
                      Générer
                    </button>
                  )}
                  {s.statut === 'ECHEC_INDEXATION' && (
                    <button
                      className="btn-sm"
                      disabled={relanceEnCours === s.id}
                      onClick={() => void relancer(s)}
                    >
                      Relancer
                    </button>
                  )}
                  <button className="btn-sm btn-danger" onClick={() => setASupprimer(s)}>
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {generations.length > 0 && (
        <>
          <div className="supports-tete generations-tete">
            <span className="supports-titre">Générations de questions</span>
          </div>
          <ul className="espace-qcms">
            {generations.slice(0, GENERATIONS_AFFICHEES).map((g) => (
              <li key={g.id} className="espace-qcm support-ligne">
                <div className="module-corps">
                  <div className="espace-qcm-titre">Génération · {g.support.titre}</div>
                  <div className="field-hint">{detailGeneration(g)}</div>
                  {g.statut === 'TERMINEE' && (
                    <div className="field-hint">
                      {g.nbSuggestions ?? 0} suggestion{(g.nbSuggestions ?? 0) > 1 ? 's' : ''} à
                      réviser
                    </div>
                  )}
                  {g.statut === 'ECHEC' && g.derniereErreur && (
                    <div className="support-erreur">{g.derniereErreur}</div>
                  )}
                </div>
                <span className={`statut-badge generation-${g.statut}`}>
                  {LIBELLES_STATUT_GENERATION[g.statut]}
                </span>
                {g.statut === 'TERMINEE' && (g.nbSuggestions ?? 0) > 0 && (
                  <button type="button" className="btn-sm" onClick={() => setAConsulter(g)}>
                    Voir les questions
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {aConsulter && (
        <SuggestionsModal generation={aConsulter} onClose={() => setAConsulter(null)} />
      )}

      {aGenerer && (
        <GenerationModal
          moduleId={moduleId}
          support={aGenerer}
          onClose={() => setAGenerer(null)}
          onLancee={() => {
            setAGenerer(null);
            void charger();
          }}
        />
      )}

      {depot && (
        <SupportModal
          moduleId={moduleId}
          moduleTitre={moduleTitre}
          onClose={() => setDepot(false)}
          onDepose={() => {
            setDepot(false);
            void charger();
          }}
        />
      )}

      {aSupprimer && (
        <ConfirmationModal
          titre="Supprimer le support ?"
          message={`« ${aSupprimer.titre} » sera supprimé avec son texte extrait et ses vecteurs. Cette action est définitive.`}
          libelleAction="Supprimer"
          onClose={() => setASupprimer(null)}
          onConfirmer={async () => {
            await supprimerSupport(aSupprimer.id);
            setASupprimer(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}

/** Modale de dépôt d'un support (un fichier, titre facultatif). */
function SupportModal({
  moduleId,
  moduleTitre,
  onClose,
  onDepose,
}: {
  moduleId: string;
  moduleTitre: string;
  onClose: () => void;
  onDepose: () => void;
}): JSX.Element {
  const champ = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [titre, setTitre] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const accept = EXTENSIONS_SUPPORT.map((e) => `.${e}`).join(',');

  const choisir = (liste: FileList | null): void => {
    const f = liste?.[0] ?? null;
    setErreur(null);
    if (!f) return setFichier(null);
    if (!(EXTENSIONS_SUPPORT as readonly string[]).includes(extensionDe(f.name))) {
      setFichier(null);
      return setErreur('Format non pris en charge : déposez un fichier PDF, PPTX, DOCX, TXT ou MD.');
    }
    if (f.size === 0) {
      setFichier(null);
      return setErreur('Le fichier est vide.');
    }
    if (f.size > TAILLE_MAX_SUPPORT) {
      setFichier(null);
      return setErreur('Le fichier dépasse 20 Mo, la taille maximale d’un support.');
    }
    setFichier(f);
  };

  const envoyer = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!fichier) {
      setErreur('Choisissez le fichier du support.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await deposerSupport(moduleId, { fichier, titre });
      onDepose();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de déposer le support.');
      setEnvoi(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={envoi} />
        <h2 className="auth-title">Nouveau support</h2>
        <p className="auth-subtitle">
          Module « {moduleTitre} ». Le texte du support est extrait et indexé : il servira de
          source à la génération de questions par IA.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void envoyer(e)}>
          <div className="field">
            <label className="field-label" htmlFor="support-fichier">
              Fichier
            </label>
            <input
              ref={champ}
              id="support-fichier"
              className="input"
              type="file"
              accept={accept}
              disabled={envoi}
              onChange={(e) => choisir(e.target.files)}
            />
            <span className="field-hint">PDF, PPTX, DOCX, TXT ou MD · 20 Mo au plus.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="support-titre">
              Titre (facultatif)
            </label>
            <input
              id="support-titre"
              className="input"
              maxLength={200}
              value={titre}
              disabled={envoi}
              placeholder={fichier ? fichier.name.replace(/\.[^.]+$/, '') : 'Nom du fichier par défaut'}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger-solid" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={envoi || !fichier}>
              {envoi ? 'Envoi…' : 'Déposer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

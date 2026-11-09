'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  ajouterLien,
  getRessourcesDuModule,
  lecteurVideo,
  modifierRessource,
  reordonnerRessources,
  RessourceCours,
  supprimerRessource,
} from '../lib/api';
import { ConfirmationModal } from './ConfirmationModal';
import { CroixFermeture } from './CroixFermeture';

/** 90 -> « 1:30 » ; 3723 -> « 1:02:03 ». */
function duree(secondes: number): string {
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  const deux = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

const estVideo = (r: RessourceCours): boolean => r.videoId !== null;

/** Ce qu'on dit d'une ressource sous son titre. */
function sousTitre(r: RessourceCours): string {
  if (r.plateforme === 'YOUTUBE' || r.plateforme === 'VIMEO') {
    const source = r.plateforme === 'YOUTUBE' ? 'Vidéo YouTube' : 'Vidéo Vimeo';
    return r.debutSecondes ? `${source} · à partir de ${duree(r.debutSecondes)}` : source;
  }
  return `Lien · ${r.domaine ?? ''}`;
}

/** Pastille d'icône : lecture (vidéo) ou maillons (lien). */
export function IconeRessource({ video }: { video: boolean }): JSX.Element {
  return (
    <span className={`ressource-icone ${video ? 'ressource-icone-video' : ''}`} aria-hidden="true">
      {video ? (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
        </svg>
      )}
    </span>
  );
}

/** Lecteur intégré 16:9, chargé seulement quand l'apprenant le demande. */
function LecteurVideo({ ressource }: { ressource: RessourceCours }): JSX.Element | null {
  const src = lecteurVideo(ressource);
  if (!src) return null;
  return (
    <div className="ressource-lecteur">
      <iframe
        src={src}
        title={ressource.titre}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/**
 * US-FORM-05 — Côté APPRENANT (« Mon espace ») : les ressources du cours d'un
 * module, au-dessus des évaluations. Une vidéo YouTube / Vimeo se regarde
 * dans la plateforme (lecteur ouvert à la demande, sans cookie de suivi) ;
 * un autre lien s'ouvre dans un nouvel onglet.
 */
export function RessourcesApprenant({ ressources }: { ressources: RessourceCours[] }): JSX.Element | null {
  const [ouverte, setOuverte] = useState<string | null>(null);
  if (ressources.length === 0) return null;
  return (
    <div className="ressources-apprenant">
      <span className="supports-titre">Ressources du cours</span>
      <ul className="espace-qcms">
        {ressources.map((r) => (
          <li key={r.id} className="espace-qcm ressource-ligne">
            <IconeRessource video={estVideo(r)} />
            <div className="module-corps">
              <div className="espace-qcm-titre">{r.titre}</div>
              <div className="field-hint">{sousTitre(r)}</div>
              {r.description && <div className="ressource-description">{r.description}</div>}
            </div>
            {estVideo(r) ? (
              <button
                className="btn-sm btn-primary-sm"
                aria-expanded={ouverte === r.id}
                onClick={() => setOuverte(ouverte === r.id ? null : r.id)}
              >
                {ouverte === r.id ? 'Fermer' : 'Regarder'}
              </button>
            ) : (
              <a className="btn-sm btn-link" href={r.url ?? '#'} target="_blank" rel="noopener noreferrer">
                Ouvrir ↗
              </a>
            )}
            {ouverte === r.id && <LecteurVideo ressource={r} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * US-FORM-05 — Côté FORMATEUR : les ressources d'un module (ajout d'un lien,
 * modification, ordre, retrait). Les apprenants inscrits les voient dans
 * « Mon espace », dans cet ordre.
 */
export function RessourcesFormateur({
  moduleId,
  moduleTitre,
  modifiable,
}: {
  moduleId: string;
  moduleTitre: string;
  modifiable: boolean;
}): JSX.Element {
  const [ressources, setRessources] = useState<RessourceCours[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<RessourceCours | 'nouveau' | null>(null);
  const [aRetirer, setARetirer] = useState<RessourceCours | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setRessources(await getRessourcesDuModule(moduleId));
      setErreur(null);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les ressources.');
    }
  }, [moduleId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const deplacer = async (index: number, sens: -1 | 1): Promise<void> => {
    if (!ressources) return;
    const ids = ressources.map((r) => r.id);
    [ids[index], ids[index + sens]] = [ids[index + sens], ids[index]];
    setEnCours(true);
    setErreur(null);
    try {
      setRessources(await reordonnerRessources(moduleId, ids));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de réordonner.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="supports-module ressources-formateur">
      <div className="supports-tete">
        <span className="supports-titre">Ressources du cours</span>
        {modifiable && (
          <button className="btn-sm" onClick={() => setEdition('nouveau')}>
            + Lien ou vidéo
          </button>
        )}
      </div>
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {ressources === null ? null : ressources.length === 0 ? (
        <p className="espace-vide">
          Aucune ressource : ajoutez une vidéo YouTube ou Vimeo, une page web ou un dépôt pour vos
          apprenants.
        </p>
      ) : (
        <ul className="espace-qcms">
          {ressources.map((r, i) => (
            <li key={r.id} className="espace-qcm ressource-ligne">
              <IconeRessource video={estVideo(r)} />
              <div className="module-corps">
                <div className="espace-qcm-titre">{r.titre}</div>
                <div className="field-hint">{sousTitre(r)}</div>
              </div>
              <div className="support-actions">
                {estVideo(r) ? (
                  <button className="btn-sm" onClick={() => setOuverte(ouverte === r.id ? null : r.id)}>
                    {ouverte === r.id ? 'Fermer' : 'Aperçu'}
                  </button>
                ) : (
                  <a className="btn-sm btn-link" href={r.url ?? '#'} target="_blank" rel="noopener noreferrer">
                    Ouvrir ↗
                  </a>
                )}
                {modifiable && (
                  <>
                    <button
                      className="btn-sm"
                      aria-label={`Monter « ${r.titre} »`}
                      disabled={enCours || i === 0}
                      onClick={() => void deplacer(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn-sm"
                      aria-label={`Descendre « ${r.titre} »`}
                      disabled={enCours || i === ressources.length - 1}
                      onClick={() => void deplacer(i, 1)}
                    >
                      ↓
                    </button>
                    <button className="btn-sm" onClick={() => setEdition(r)}>
                      Modifier
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => setARetirer(r)}>
                      Retirer
                    </button>
                  </>
                )}
              </div>
              {ouverte === r.id && <LecteurVideo ressource={r} />}
            </li>
          ))}
        </ul>
      )}

      {edition && (
        <LienModal
          moduleId={moduleId}
          moduleTitre={moduleTitre}
          ressource={edition === 'nouveau' ? null : edition}
          onClose={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null);
            void charger();
          }}
        />
      )}
      {aRetirer && (
        <ConfirmationModal
          titre="Retirer la ressource ?"
          message={`« ${aRetirer.titre} » ne sera plus visible par vos apprenants.`}
          libelleAction="Retirer"
          onClose={() => setARetirer(null)}
          onConfirmer={async () => {
            await supprimerRessource(aRetirer.id);
            setARetirer(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}

/** Ce que l'adresse saisie deviendra, avant l'envoi (le serveur décide). */
function apercuAdresse(url: string): string | null {
  const brut = url.trim();
  if (!brut) return null;
  if (/^https?:\/\/([a-z]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(brut)) {
    return 'Vidéo YouTube : elle sera lue dans la plateforme.';
  }
  if (/^https?:\/\/(www\.|player\.)?vimeo\.com\//i.test(brut)) {
    return 'Vidéo Vimeo : elle sera lue dans la plateforme.';
  }
  if (/^https?:\/\//i.test(brut)) return 'Lien : il s’ouvrira dans un nouvel onglet.';
  return 'L’adresse doit commencer par http:// ou https://.';
}

/** Modale d'ajout ou de modification d'un lien. */
function LienModal({
  moduleId,
  moduleTitre,
  ressource,
  onClose,
  onEnregistre,
}: {
  moduleId: string;
  moduleTitre: string;
  ressource: RessourceCours | null;
  onClose: () => void;
  onEnregistre: () => void;
}): JSX.Element {
  const [titre, setTitre] = useState(ressource?.titre ?? '');
  const [url, setUrl] = useState(ressource?.url ?? '');
  const [description, setDescription] = useState(ressource?.description ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const apercu = apercuAdresse(url);

  const envoyer = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      if (ressource) {
        await modifierRessource(ressource.id, { titre, url, description });
      } else {
        await ajouterLien(moduleId, {
          titre,
          url,
          ...(description.trim() ? { description } : {}),
        });
      }
      onEnregistre();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Enregistrement impossible.');
      setEnvoi(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={envoi} />
        <h2 className="auth-title">{ressource ? 'Modifier la ressource' : 'Nouvelle ressource'}</h2>
        <p className="auth-subtitle">
          Module « {moduleTitre} ». Vos apprenants inscrits la verront dans « Mon espace ».
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void envoyer(e)}>
          <div className="field">
            <label className="field-label" htmlFor="ress-url">
              Adresse
            </label>
            <input
              id="ress-url"
              className="input"
              type="url"
              inputMode="url"
              maxLength={2048}
              value={url}
              disabled={envoi}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => setUrl(e.target.value)}
            />
            {apercu && <span className="field-hint">{apercu}</span>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ress-titre">
              Titre
            </label>
            <input
              id="ress-titre"
              className="input"
              maxLength={200}
              value={titre}
              disabled={envoi}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ress-description">
              Description (facultative)
            </label>
            <textarea
              id="ress-description"
              className="input"
              rows={2}
              maxLength={500}
              value={description}
              disabled={envoi}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger-solid" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={envoi || !titre.trim() || !url.trim()}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

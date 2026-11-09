'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  ajouterLien,
  deposerFichierRessource,
  getRessourcesDuModule,
  lecteurVideo,
  lienLectureRessource,
  modifierRessource,
  reordonnerRessources,
  RessourceCours,
  supprimerRessource,
} from '../lib/api';
import { tailleFr } from '../lib/format';
import { ConfirmationModal } from './ConfirmationModal';
import { CroixFermeture } from './CroixFermeture';

/** Taille maximale indicative (le serveur applique RESSOURCES_TAILLE_MAX_MO). */
const TAILLE_MAX_INDICATIVE = 500 * 1024 * 1024;

/** 90 -> « 1:30 » ; 3723 -> « 1:02:03 ». */
function duree(secondes: number): string {
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  const deux = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

type Genre = 'video' | 'audio' | 'document' | 'image' | 'fichier' | 'lien';

/** Ce qu'est une ressource, pour l'icône et l'action proposée. */
function genre(r: RessourceCours): Genre {
  if (r.videoId) return 'video';
  if (!r.fichier) return 'lien';
  switch (r.fichier.lecture) {
    case 'VIDEO':
      return 'video';
    case 'AUDIO':
      return 'audio';
    case 'PDF':
      return 'document';
    case 'IMAGE':
      return 'image';
    default:
      return 'fichier';
  }
}

/** Ce qu'on dit d'une ressource sous son titre. */
function sousTitre(r: RessourceCours): string {
  if (r.fichier) {
    const ext = r.fichier.extension ? r.fichier.extension.toUpperCase() : 'Fichier';
    const quoi: Record<Genre, string> = {
      video: 'Vidéo',
      audio: 'Audio',
      document: 'Document PDF',
      image: 'Image',
      fichier: `${ext} · à télécharger`,
      lien: '',
    };
    return `${quoi[genre(r)]} · ${tailleFr(r.fichier.tailleOctets)}`;
  }
  if (r.plateforme === 'YOUTUBE' || r.plateforme === 'VIMEO') {
    const source = r.plateforme === 'YOUTUBE' ? 'Vidéo YouTube' : 'Vidéo Vimeo';
    return r.debutSecondes ? `${source} · à partir de ${duree(r.debutSecondes)}` : source;
  }
  return `Lien · ${r.domaine ?? ''}`;
}

const TRACES: Record<Genre, JSX.Element> = {
  video: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  audio: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20 16l-5-5-8 8" />
    </>
  ),
  fichier: (
    <>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </>
  ),
  lien: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
};

/** Pastille d'icône selon le genre de ressource. */
export function IconeRessource({ ressource }: { ressource: RessourceCours }): JSX.Element {
  const g = genre(ressource);
  return (
    <span className={`ressource-icone ressource-icone-${g}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TRACES[g]}
      </svg>
    </span>
  );
}

/** Ouvre le fichier dans un nouvel onglet (ouvert AVANT l'appel : pas de blocage de fenêtre). */
async function ouvrirDansOnglet(r: RessourceCours): Promise<void> {
  const onglet = window.open('', '_blank');
  try {
    const url = await lienLectureRessource(r.id);
    if (onglet) {
      onglet.opener = null;
      onglet.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (erreur) {
    onglet?.close();
    throw erreur;
  }
}

/** Lecteur dans la carte : vidéo YouTube / Vimeo, vidéo, audio ou image déposés. */
function Lecteur({ ressource }: { ressource: RessourceCours }): JSX.Element | null {
  const [src, setSrc] = useState<string | null>(ressource.fichier ? null : lecteurVideo(ressource));
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (!ressource.fichier) return;
    let actif = true;
    lienLectureRessource(ressource.id)
      .then((url) => actif && setSrc(url))
      .catch((e: unknown) =>
        actif && setErreur(e instanceof AdminError ? e.message : 'Lecture impossible.'),
      );
    return () => {
      actif = false;
    };
  }, [ressource]);
  if (erreur) return <p className="alert alert-error ressource-pleine">{erreur}</p>;
  if (!src) return <p className="field-hint ressource-pleine">Chargement…</p>;
  const g = genre(ressource);
  if (!ressource.fichier) {
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
  if (g === 'video') {
    return (
      <div className="ressource-lecteur">
        <video src={src} controls autoPlay preload="metadata" playsInline>
          Votre navigateur ne lit pas cette vidéo.
        </video>
      </div>
    );
  }
  if (g === 'audio') {
    return <audio className="ressource-audio" src={src} controls autoPlay preload="metadata" />;
  }
  if (g === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ressource-image" src={src} alt={ressource.titre} />;
  }
  return null;
}

/** Bouton d'action d'une ressource, selon son genre. */
function ActionRessource({
  ressource,
  ouverte,
  basculer,
  principal,
}: {
  ressource: RessourceCours;
  ouverte: boolean;
  basculer: () => void;
  principal: boolean;
}): JSX.Element {
  const [erreur, setErreur] = useState<string | null>(null);
  const classe = principal ? 'btn-sm btn-primary-sm' : 'btn-sm';
  const g = genre(ressource);
  if (g === 'lien') {
    return (
      <a className="btn-sm btn-link" href={ressource.url ?? '#'} target="_blank" rel="noopener noreferrer">
        Ouvrir ↗
      </a>
    );
  }
  if (g === 'document' || g === 'fichier') {
    return (
      <button
        className={g === 'fichier' ? 'btn-sm' : classe}
        title={erreur ?? undefined}
        onClick={() =>
          void ouvrirDansOnglet(ressource).catch((e: unknown) =>
            setErreur(e instanceof AdminError ? e.message : 'Ouverture impossible.'),
          )
        }
      >
        {erreur ? 'Réessayer' : g === 'document' ? 'Ouvrir ↗' : 'Télécharger'}
      </button>
    );
  }
  const libelles: Record<'video' | 'audio' | 'image', string> = {
    video: principal ? 'Regarder' : 'Aperçu',
    audio: 'Écouter',
    image: 'Voir',
  };
  return (
    <button className={classe} aria-expanded={ouverte} onClick={basculer}>
      {ouverte ? 'Fermer' : libelles[g]}
    </button>
  );
}

/**
 * US-FORM-05 / US-FORM-06 — Côté APPRENANT (« Mon espace ») : les ressources
 * du cours d'un module, au-dessus des évaluations. Vidéos (YouTube, Vimeo ou
 * déposées), audio et images se consultent dans la carte ; un PDF s'ouvre
 * dans un onglet ; les autres fichiers se téléchargent ; un lien s'ouvre dans
 * un nouvel onglet.
 */
export function RessourcesApprenant({
  ressources,
}: {
  ressources: RessourceCours[];
}): JSX.Element | null {
  const [ouverte, setOuverte] = useState<string | null>(null);
  if (ressources.length === 0) return null;
  return (
    <div className="ressources-apprenant">
      <span className="supports-titre">Ressources du cours</span>
      <ul className="espace-qcms">
        {ressources.map((r) => (
          <li key={r.id} className="espace-qcm ressource-ligne">
            <IconeRessource ressource={r} />
            <div className="module-corps">
              <div className="espace-qcm-titre">{r.titre}</div>
              <div className="field-hint">{sousTitre(r)}</div>
              {r.description && <div className="ressource-description">{r.description}</div>}
            </div>
            <ActionRessource
              ressource={r}
              principal
              ouverte={ouverte === r.id}
              basculer={() => setOuverte(ouverte === r.id ? null : r.id)}
            />
            {ouverte === r.id && <Lecteur ressource={r} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * US-FORM-05 / US-FORM-06 — Côté FORMATEUR : les ressources d'un module
 * (lien ou vidéo, fichier ; modification, ordre, retrait). Les apprenants
 * inscrits les voient dans « Mon espace », dans cet ordre.
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
  const [depot, setDepot] = useState(false);
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
          <div className="supports-boutons">
            <button className="btn-sm" onClick={() => setEdition('nouveau')}>
              + Lien ou vidéo
            </button>
            <button className="btn-sm" onClick={() => setDepot(true)}>
              + Fichier
            </button>
          </div>
        )}
      </div>
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {ressources === null ? null : ressources.length === 0 ? (
        <p className="espace-vide">
          Aucune ressource : ajoutez une vidéo (YouTube, Vimeo ou fichier MP4), un document, une page
          web ou un dépôt pour vos apprenants.
        </p>
      ) : (
        <ul className="espace-qcms">
          {ressources.map((r, i) => (
            <li key={r.id} className="espace-qcm ressource-ligne">
              <IconeRessource ressource={r} />
              <div className="module-corps">
                <div className="espace-qcm-titre">{r.titre}</div>
                <div className="field-hint">{sousTitre(r)}</div>
              </div>
              <div className="support-actions">
                <ActionRessource
                  ressource={r}
                  principal={false}
                  ouverte={ouverte === r.id}
                  basculer={() => setOuverte(ouverte === r.id ? null : r.id)}
                />
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
              {ouverte === r.id && <Lecteur ressource={r} />}
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
      {depot && (
        <FichierModal
          moduleId={moduleId}
          moduleTitre={moduleTitre}
          onClose={() => setDepot(false)}
          onDepose={() => {
            setDepot(false);
            void charger();
          }}
        />
      )}
      {aRetirer && (
        <ConfirmationModal
          titre="Retirer la ressource ?"
          message={`« ${aRetirer.titre} » ne sera plus visible par vos apprenants${aRetirer.fichier ? ' et le fichier sera supprimé' : ''}.`}
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

/** Modale d'ajout ou de modification d'un lien (ou du titre d'un fichier). */
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
  const estFichier = ressource?.fichier != null;
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
        await modifierRessource(ressource.id, {
          titre,
          description,
          ...(estFichier ? {} : { url }),
        });
      } else {
        await ajouterLien(moduleId, { titre, url, ...(description.trim() ? { description } : {}) });
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
        <h2 className="auth-title">{ressource ? 'Modifier la ressource' : 'Nouveau lien ou vidéo'}</h2>
        <p className="auth-subtitle">
          Module « {moduleTitre} ». Vos apprenants inscrits la verront dans « Mon espace ».
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void envoyer(e)}>
          {!estFichier && (
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
          )}
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
            <button
              type="submit"
              className="btn"
              disabled={envoi || !titre.trim() || (!estFichier && !url.trim())}
            >
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Modale de dépôt d'un fichier (tout type ; vidéo, audio, PDF et images lisibles en ligne). */
function FichierModal({
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
  const [fichier, setFichier] = useState<File | null>(null);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const choisir = (liste: FileList | null): void => {
    const f = liste?.[0] ?? null;
    setErreur(null);
    if (f && f.size === 0) {
      setFichier(null);
      setErreur('Le fichier est vide.');
      return;
    }
    if (f && f.size > TAILLE_MAX_INDICATIVE) {
      setFichier(null);
      setErreur('Le fichier dépasse 500 Mo.');
      return;
    }
    setFichier(f);
  };

  const envoyer = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await deposerFichierRessource(moduleId, { fichier, titre, description });
      onDepose();
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de déposer le fichier.');
      setEnvoi(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={envoi} />
        <h2 className="auth-title">Nouveau fichier</h2>
        <p className="auth-subtitle">
          Module « {moduleTitre} ». Vidéos (MP4, WebM), audio, PDF et images se consultent dans la
          plateforme ; les autres fichiers se téléchargent.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="form" onSubmit={(e) => void envoyer(e)}>
          <div className="field">
            <label className="field-label" htmlFor="ress-fichier">
              Fichier
            </label>
            <input
              id="ress-fichier"
              className="input"
              type="file"
              disabled={envoi}
              onChange={(e) => choisir(e.target.files)}
            />
            <span className="field-hint">
              {fichier ? `${fichier.name} · ${tailleFr(fichier.size)}` : 'Tout type de fichier.'}
            </span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ress-fichier-titre">
              Titre (facultatif)
            </label>
            <input
              id="ress-fichier-titre"
              className="input"
              maxLength={200}
              value={titre}
              disabled={envoi}
              placeholder={fichier ? fichier.name.replace(/\.[^.]+$/, '') : 'Nom du fichier par défaut'}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ress-fichier-description">
              Description (facultative)
            </label>
            <textarea
              id="ress-fichier-description"
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
            <button type="submit" className="btn" disabled={envoi || !fichier}>
              {envoi ? 'Envoi…' : 'Déposer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

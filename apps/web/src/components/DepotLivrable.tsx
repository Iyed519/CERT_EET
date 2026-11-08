'use client';
import { useRef, useState } from 'react';
import { AtelierApprenant, LivrableApprenant, soumettreLivrable } from '../lib/api';
import { tailleFr } from '../lib/format';
import { ConfirmationModal } from './ConfirmationModal';

const COMMENTAIRE_MAX = 2000;
const LIENS_MAX = 5;

/** Extension d'un nom de fichier, en minuscules, sans le point. */
function extensionDe(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(point + 1).toLowerCase() : '';
}

/**
 * US-ATEL-04 — Formulaire de dépôt d'un livrable (UC4 Apprenant, étapes 3 à 5).
 *
 * Fichiers (extensions, taille et nombre de l'atelier), commentaire libre et
 * liens externes. Les contrôles d'ici évitent un envoi inutile ; le serveur
 * revérifie tout (y compris le contenu réel des fichiers) et son message
 * s'affiche tel quel. Une confirmation rappelle que le dépôt est définitif.
 */
export function DepotLivrable({
  atelier,
  onDepose,
}: {
  atelier: AtelierApprenant;
  onDepose: (livrable: LivrableApprenant) => void;
}): JSX.Element {
  const champFichiers = useRef<HTMLInputElement>(null);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [commentaire, setCommentaire] = useState('');
  const [liens, setLiens] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const accept = atelier.typesLivrables.map((t) => `.${t}`).join(',');
  const tailleMax = atelier.tailleMaxMo * 1024 * 1024;

  /** Ajoute les fichiers choisis, en refusant d'emblée ce que le serveur refuserait. */
  const ajouter = (choisis: FileList | null): void => {
    if (!choisis) return;
    setErreur(null);
    const suivants = [...fichiers];
    for (const f of Array.from(choisis)) {
      if (!(atelier.typesLivrables as string[]).includes(extensionDe(f.name))) {
        setErreur(
          `Format non autorisé pour « ${f.name} ». Extensions acceptées : ${accept.split(',').join(', ')}.`,
        );
        continue;
      }
      if (f.size === 0) {
        setErreur(`Le fichier « ${f.name} » est vide.`);
        continue;
      }
      if (f.size > tailleMax) {
        setErreur(`Le fichier « ${f.name} » dépasse ${atelier.tailleMaxMo} Mo.`);
        continue;
      }
      if (suivants.length >= atelier.nbMaxFichiers) {
        setErreur(
          `${atelier.nbMaxFichiers} fichier${atelier.nbMaxFichiers > 1 ? 's' : ''} au plus.`,
        );
        break;
      }
      if (!suivants.some((s) => s.name === f.name && s.size === f.size)) suivants.push(f);
    }
    setFichiers(suivants);
    if (champFichiers.current) champFichiers.current.value = '';
  };

  const liensRemplis = liens.map((l) => l.trim()).filter((l) => l.length > 0);

  return (
    <section className="depot" aria-labelledby="titre-depot">
      <h2 id="titre-depot" className="section-title">
        Déposer mon livrable
      </h2>
      {atelier.etatDepot === 'EN_RETARD' && (
        <p className="alert alert-info">
          La date limite est passée : votre dépôt sera accepté pendant la tolérance, mais marqué
          en retard.
        </p>
      )}
      {erreur !== null && <p className="alert alert-error depot-message">{erreur}</p>}

      <div className="depot-zone">
        <label className="btn-sm btn-primary-sm depot-choisir" htmlFor="depot-fichiers">
          Choisir des fichiers
        </label>
        <input
          ref={champFichiers}
          id="depot-fichiers"
          className="depot-input"
          type="file"
          multiple={atelier.nbMaxFichiers > 1}
          accept={accept}
          onChange={(e) => ajouter(e.target.files)}
        />
        <span className="field-hint">
          {accept.split(',').join(' · ')} — {atelier.nbMaxFichiers} fichier
          {atelier.nbMaxFichiers > 1 ? 's' : ''} max, {atelier.tailleMaxMo} Mo chacun
        </span>
      </div>

      {fichiers.length > 0 && (
        <ul className="depot-fichiers">
          {fichiers.map((f) => (
            <li key={`${f.name}-${f.size}`} className="depot-fichier">
              <span className="depot-fichier-nom">{f.name}</span>
              <span className="field-hint">{tailleFr(f.size)}</span>
              <button
                type="button"
                className="btn-sm btn-danger"
                onClick={() => setFichiers(fichiers.filter((x) => x !== f))}
                aria-label={`Retirer ${f.name}`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="field-label" htmlFor="depot-commentaire">
        Commentaire pour le formateur (facultatif)
      </label>
      <textarea
        id="depot-commentaire"
        className="input depot-commentaire"
        rows={3}
        maxLength={COMMENTAIRE_MAX}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
      />
      <span className="field-hint">
        {commentaire.length} / {COMMENTAIRE_MAX}
      </span>

      <div className="depot-liens">
        <span className="field-label">Liens externes (facultatif : GitHub, Drive, déploiement…)</span>
        {liens.map((lien, i) => (
          <div key={i} className="depot-lien">
            <input
              className="input"
              type="url"
              placeholder="https://"
              value={lien}
              onChange={(e) => setLiens(liens.map((l, j) => (j === i ? e.target.value : l)))}
              aria-label={`Lien ${i + 1}`}
            />
            <button
              type="button"
              className="btn-sm btn-danger"
              onClick={() => setLiens(liens.filter((_, j) => j !== i))}
              aria-label={`Retirer le lien ${i + 1}`}
            >
              Retirer
            </button>
          </div>
        ))}
        {liens.length < LIENS_MAX && (
          <button type="button" className="btn-sm" onClick={() => setLiens([...liens, ''])}>
            + Ajouter un lien
          </button>
        )}
      </div>

      <div className="depot-pied">
        <span className="field-hint">
          Un seul dépôt par atelier : vérifiez vos fichiers avant de soumettre.
        </span>
        <button
          type="button"
          className="btn"
          disabled={fichiers.length === 0}
          title={fichiers.length === 0 ? 'Joignez au moins un fichier.' : undefined}
          onClick={() => {
            setErreur(null);
            setConfirmer(true);
          }}
        >
          Soumettre le livrable
        </button>
      </div>

      {confirmer && (
        <ConfirmationModal
          titre="Soumettre le livrable"
          message={`${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} (${tailleFr(
            fichiers.reduce((t, f) => t + f.size, 0),
          )})${liensRemplis.length > 0 ? ` et ${liensRemplis.length} lien${liensRemplis.length > 1 ? 's' : ''}` : ''} ${fichiers.length + liensRemplis.length > 1 ? 'seront envoyés' : 'sera envoyé'} au formateur. Le dépôt est définitif : il ne pourra pas être remplacé.`}
          libelleAction="Soumettre"
          onConfirmer={async () => {
            const livrable = await soumettreLivrable(atelier.id, {
              fichiers,
              commentaire,
              liens: liensRemplis,
            });
            setConfirmer(false);
            onDepose(livrable);
          }}
          onClose={() => setConfirmer(false)}
        />
      )}
    </section>
  );
}


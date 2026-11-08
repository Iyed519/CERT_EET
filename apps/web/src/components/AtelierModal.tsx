'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AdminError,
  AtelierDetail,
  createAtelier,
  EXTENSIONS_CODE,
  EXTENSIONS_DOCUMENT,
  ExtensionLivrable,
  updateAtelier,
} from '../lib/api';
import { depuisSaisieLocale, versSaisieLocale } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/** Valeurs du formulaire (les nombres restent des nombres, NaN si vide). */
interface Saisie {
  titre: string;
  enonce: string;
  competencesVisees: string;
  dateLimite: string; // valeur d'un <input type="datetime-local">, heure locale
  typesLivrables: ExtensionLivrable[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
  toleranceRetardHeures: number;
}

const saisieInitiale = (atelier?: AtelierDetail): Saisie => ({
  titre: atelier?.titre ?? '',
  enonce: atelier?.enonce ?? '',
  competencesVisees: atelier?.competencesVisees ?? '',
  dateLimite: atelier ? versSaisieLocale(atelier.dateLimite) : '',
  typesLivrables: atelier?.typesLivrables ?? ['pdf'],
  tailleMaxMo: atelier?.tailleMaxMo ?? 20,
  nbMaxFichiers: atelier?.nbMaxFichiers ?? 1,
  toleranceRetardHeures: atelier?.toleranceRetardHeures ?? 0,
});

/**
 * Modale d'un atelier (US-ATEL-01, DS-13 partie 1) : création dans un module
 * (l'atelier naît en brouillon) ou modification d'un brouillon.
 *
 * La date limite se saisit en heure locale et part en ISO 8601 (UTC). Le
 * serveur la compare à SON horloge : une date déjà passée est refusée avec un
 * message clair, affiché ici tel quel, et rien n'est enregistré.
 */
export function AtelierModal({
  moduleId,
  moduleTitre,
  atelier,
  onClose,
  onEnregistre,
}: {
  moduleId?: string;
  moduleTitre?: string;
  atelier?: AtelierDetail;
  onClose: () => void;
  onEnregistre: (atelier: AtelierDetail) => void;
}): JSX.Element {
  const creation = atelier === undefined;
  const [s, setS] = useState<Saisie>(() => saisieInitiale(atelier));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le formulaire est long : le message d'erreur, en haut, sort de l'écran.
  const refErreur = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (erreur !== null) refErreur.current?.scrollIntoView({ block: 'nearest' });
  }, [erreur]);

  const texte =
    (champ: 'titre' | 'enonce' | 'competencesVisees' | 'dateLimite') =>
    (e: { target: { value: string } }): void =>
      setS((p) => ({ ...p, [champ]: e.target.value }));
  const nombre =
    (champ: 'tailleMaxMo' | 'nbMaxFichiers' | 'toleranceRetardHeures') =>
    (e: { target: { value: string } }): void =>
      setS((p) => ({ ...p, [champ]: e.target.value === '' ? NaN : Number(e.target.value) }));
  const basculerType = (type: ExtensionLivrable): void =>
    setS((p) => ({
      ...p,
      typesLivrables: p.typesLivrables.includes(type)
        ? p.typesLivrables.filter((t) => t !== type)
        : [...p.typesLivrables, type],
    }));

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (s.typesLivrables.length === 0) {
      setErreur('Choisissez au moins un type de livrable.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    const commun = {
      titre: s.titre,
      enonce: s.enonce,
      dateLimite: depuisSaisieLocale(s.dateLimite),
      typesLivrables: s.typesLivrables,
      tailleMaxMo: s.tailleMaxMo,
      nbMaxFichiers: s.nbMaxFichiers,
      toleranceRetardHeures: s.toleranceRetardHeures,
    };
    try {
      const resultat = creation
        ? await createAtelier(moduleId as string, {
            ...commun,
            ...(s.competencesVisees.trim() ? { competencesVisees: s.competencesVisees } : {}),
          })
        : await updateAtelier(atelier.id, {
            ...commun,
            competencesVisees: s.competencesVisees.trim() ? s.competencesVisees : null,
          });
      onEnregistre(resultat);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’enregistrer l’atelier.');
      setEnCours(false);
    }
  };

  const valeur = (n: number): number | string => (Number.isNaN(n) ? '' : n);

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">{creation ? 'Nouvel atelier' : 'Modifier l’atelier'}</h2>
        {creation && moduleTitre && (
          <p className="auth-subtitle">
            Dans le module « {moduleTitre} ». Il sera créé en brouillon : la grille de notation et
            la publication viendront ensuite.
          </p>
        )}
        {erreur !== null && (
          <p ref={refErreur} className="alert alert-error">
            {erreur}
          </p>
        )}
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="at-titre">
              Titre
            </label>
            <input
              id="at-titre"
              className="input"
              required
              minLength={3}
              maxLength={200}
              value={s.titre}
              onChange={texte('titre')}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="at-enonce">
              Énoncé
            </label>
            <textarea
              id="at-enonce"
              className="input"
              rows={6}
              required
              minLength={10}
              maxLength={20000}
              value={s.enonce}
              onChange={texte('enonce')}
              disabled={enCours}
            />
            <span className="field-hint">Objectif, consignes, ressources à utiliser…</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="at-competences">
              Compétences visées (facultatif)
            </label>
            <textarea
              id="at-competences"
              className="input"
              rows={2}
              maxLength={2000}
              value={s.competencesVisees}
              onChange={texte('competencesVisees')}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="at-date-limite">
              Date limite de soumission
            </label>
            <input
              id="at-date-limite"
              className="input"
              type="datetime-local"
              required
              value={s.dateLimite}
              onChange={texte('dateLimite')}
              disabled={enCours}
            />
            <span className="field-hint">Heure locale. Elle doit être dans le futur.</span>
          </div>

          <fieldset className="groupe-config" disabled={enCours}>
            <legend className="field-label">Types de livrables acceptés</legend>
            {(
              [
                ['Documents et archives', EXTENSIONS_DOCUMENT],
                ['Code source', EXTENSIONS_CODE],
              ] as const
            ).map(([famille, types]) => (
              <div key={famille}>
                <p className="field-hint famille-types">{famille}</p>
                <div className="cases-types">
                  {types.map((type) => (
                    <label key={type} className="case">
                      <input
                        type="checkbox"
                        checked={s.typesLivrables.includes(type)}
                        onChange={() => basculerType(type)}
                      />
                      .{type}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <span className="field-hint">
              Un projet de plusieurs fichiers se rend en .zip.
            </span>
          </fieldset>

          <fieldset className="groupe-config" disabled={enCours}>
            <legend className="field-label">Modalités de soumission</legend>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="at-taille">
                  Taille max. par fichier (Mo)
                </label>
                <input
                  id="at-taille"
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={valeur(s.tailleMaxMo)}
                  onChange={nombre('tailleMaxMo')}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="at-fichiers">
                  Fichiers max. par soumission
                </label>
                <input
                  id="at-fichiers"
                  className="input"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  required
                  value={valeur(s.nbMaxFichiers)}
                  onChange={nombre('nbMaxFichiers')}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="at-tolerance">
                  Tolérance de retard (h)
                </label>
                <input
                  id="at-tolerance"
                  className="input"
                  type="number"
                  min={0}
                  max={168}
                  step={1}
                  required
                  value={valeur(s.toleranceRetardHeures)}
                  onChange={nombre('toleranceRetardHeures')}
                />
              </div>
            </div>
            <span className="field-hint">
              Tolérance : délai de grâce après la date limite (0 = aucun retard accepté).
            </span>
          </fieldset>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button type="submit" className="btn" disabled={enCours}>
              {enCours ? 'Enregistrement…' : creation ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

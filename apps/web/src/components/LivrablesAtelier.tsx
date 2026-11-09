'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  getLivrablesAtelier,
  LivrableResume,
  ouvrirCorrection,
  StatutLivrable,
} from '../lib/api';
import { dateHeureFr, LIBELLES_LIVRABLE_FORMATEUR, nomApprenantFr } from '../lib/format';

/** Filtres de la liste (DS-03 : `?statut=SOUMIS`). */
const FILTRES: Array<{ valeur: StatutLivrable | null; libelle: string }> = [
  { valeur: null, libelle: 'Tous' },
  { valeur: 'SOUMIS', libelle: 'À corriger' },
  { valeur: 'EN_CORRECTION', libelle: 'En correction' },
  { valeur: 'NOTE', libelle: 'Notés' },
];

/**
 * US-ATEL-06 — Livrables d'un atelier publié, côté formateur (UC5, DS-03
 * partie 2). Premier déposé en tête ; « Corriger » ouvre la correction
 * (SOUMIS -> EN_CORRECTION : l'apprenant ne peut plus agir) puis mène à la
 * page de correction ; « Reprendre » y retourne pour une correction en cours.
 */
export function LivrablesAtelier({ atelierId }: { atelierId: string }): JSX.Element {
  const router = useRouter();
  const [filtre, setFiltre] = useState<StatutLivrable | null>(null);
  const [livrables, setLivrables] = useState<LivrableResume[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setErreur(null);
    try {
      setLivrables(await getLivrablesAtelier(atelierId, filtre ?? undefined));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les livrables.');
    }
  }, [atelierId, filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const corriger = async (livrable: LivrableResume): Promise<void> => {
    setErreur(null);
    setOuverture(livrable.id);
    try {
      await ouvrirCorrection(livrable.id);
      router.push(`/formateur/livrables/${livrable.id}`);
    } catch (error) {
      // Je recharge d'abord (la liste a changé : ouverte ailleurs), puis
      // j'affiche le refus — charger() efface le message précédent.
      await charger();
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’ouvrir la correction.');
      setOuverture(null);
    }
  };

  return (
    <section className="livrables-atelier" aria-labelledby="titre-livrables">
      <div className="section-tete">
        <h2 id="titre-livrables" className="section-title">
          Livrables
        </h2>
        <div className="filtres-livrables" role="group" aria-label="Filtrer les livrables">
          {FILTRES.map((f) => (
            <button
              key={f.libelle}
              type="button"
              className={`filtre-livrable${filtre === f.valeur ? ' filtre-livrable-actif' : ''}`}
              aria-pressed={filtre === f.valeur}
              onClick={() => setFiltre(f.valeur)}
            >
              {f.libelle}
            </button>
          ))}
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {livrables === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : livrables.length === 0 ? (
        <p className="espace-vide">
          {filtre === null
            ? 'Aucun livrable déposé pour le moment.'
            : 'Aucun livrable dans cette catégorie.'}
        </p>
      ) : (
        <ul className="livrables-liste">
          {livrables.map((l) => (
            <li key={l.id} className="livrable-ligne">
              <div className="livrable-ligne-corps">
                <p className="livrable-ligne-nom">{nomApprenantFr(l.apprenant)}</p>
                <p className="field-hint">
                  Déposé le {dateHeureFr(l.dateSoumission)} · version {l.version} · {l.nbFichiers}{' '}
                  fichier{l.nbFichiers > 1 ? 's' : ''}
                  {l.enRetard && <span className="livrable-retard"> · en retard</span>}
                </p>
              </div>
              <div className="livrable-ligne-actions">
                <span className={`statut-badge livrable-formateur-${l.statut}`}>
                  {LIBELLES_LIVRABLE_FORMATEUR[l.statut]}
                </span>
                {l.avancement && l.statut === 'EN_CORRECTION' && (
                  <span className="field-hint">
                    {l.avancement.notes}/{l.avancement.total} critère
                    {l.avancement.total > 1 ? 's' : ''}
                  </span>
                )}
                {l.statut === 'SOUMIS' ? (
                  <button
                    type="button"
                    className="btn-sm btn-primary-sm"
                    onClick={() => void corriger(l)}
                    disabled={ouverture !== null}
                  >
                    {ouverture === l.id ? 'Ouverture…' : 'Corriger'}
                  </button>
                ) : (
                  <Link className="btn-sm btn-lien" href={`/formateur/livrables/${l.id}`}>
                    {l.statut === 'EN_CORRECTION' ? 'Reprendre' : 'Consulter'}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

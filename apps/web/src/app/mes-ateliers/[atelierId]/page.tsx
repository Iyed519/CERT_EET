'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DepotLivrable } from '../../../components/DepotLivrable';
import { GrilleLecture } from '../../../components/GrilleLecture';
import { MonLivrable } from '../../../components/MonLivrable';
import { AdminError, AtelierApprenant, getMonAtelier } from '../../../lib/api';
import { dateHeureFr, echeanceAtelierFr, LIBELLES_ETAT_DEPOT } from '../../../lib/format';

/**
 * US-ATEL-03 — Fiche d'un atelier publié, côté apprenant (UC4 Apprenant,
 * étape 1 : « l'apprenant lit l'énoncé complet de l'atelier : objectif,
 * consignes, grille de notation visible »).
 *
 * Échéance et état du dépôt (calculé par le serveur), modalités de dépôt,
 * énoncé, compétences visées, puis la grille en lecture seule.
 * US-ATEL-04 — En bas : mon livrable s'il est déposé, sinon le formulaire de
 * dépôt tant que le dépôt n'est pas clos (le serveur revérifie tout). Un atelier inconnu ou encore en brouillon
 * répond 404, un apprenant non inscrit 403 : le message du serveur s'affiche.
 */
export default function MonAtelierPage(): JSX.Element {
  const params = useParams<{ atelierId: string }>();
  const atelierId = params?.atelierId ?? '';
  const [atelier, setAtelier] = useState<AtelierApprenant | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [remplacer, setRemplacer] = useState(false);

  useEffect(() => {
    if (!atelierId) return;
    let actif = true;
    getMonAtelier(atelierId)
      .then((a) => {
        if (actif) setAtelier(a);
      })
      .catch((error: unknown) => {
        if (actif) {
          setErreur(
            error instanceof AdminError ? error.message : 'Impossible de charger l’atelier.',
          );
        }
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [atelierId]);

  return (
    <>
      <p className="back-link-row">
        <Link
          className="back-link"
          href={atelier ? `/mes-inscriptions/${atelier.formationId}` : '/mes-inscriptions'}
        >
          {atelier ? `← ${atelier.formationTitre}` : '← Mes inscriptions'}
        </Link>
      </p>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : atelier === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{atelier.titre}</h1>
              <p className="page-subtitle">Atelier · module « {atelier.moduleTitre} »</p>
            </div>
            <span className={`statut-badge depot-badge-${atelier.etatDepot}`}>
              {LIBELLES_ETAT_DEPOT[atelier.etatDepot]}
            </span>
          </div>

          <p className={`atelier-echeance depot-${atelier.etatDepot}`}>
            {echeanceAtelierFr(atelier.etatDepot, atelier.dateLimite, atelier.toleranceRetardHeures)}
          </p>

          <dl className="fiche">
            <div>
              <dt>Date limite</dt>
              <dd>{dateHeureFr(atelier.dateLimite)}</dd>
            </div>
            <div>
              <dt>Tolérance de retard</dt>
              <dd>
                {atelier.toleranceRetardHeures === 0
                  ? 'Aucune'
                  : `${atelier.toleranceRetardHeures} h (dépôt marqué en retard)`}
              </dd>
            </div>
            <div>
              <dt>Livrables acceptés</dt>
              <dd>{atelier.typesLivrables.map((t) => `.${t}`).join(' · ')}</dd>
            </div>
            <div>
              <dt>Par soumission</dt>
              <dd>
                {atelier.nbMaxFichiers} fichier{atelier.nbMaxFichiers > 1 ? 's' : ''} max ·{' '}
                {atelier.tailleMaxMo} Mo par fichier
              </dd>
            </div>
            {atelier.competencesVisees && (
              <div className="fiche-large">
                <dt>Compétences visées</dt>
                <dd>{atelier.competencesVisees}</dd>
              </div>
            )}
          </dl>

          <h2 className="section-title">Énoncé</h2>
          <div className="enonce-atelier">{atelier.enonce}</div>

          <section aria-labelledby="titre-grille-lecture">
            <div className="grille-lecture-tete">
              <h2 id="titre-grille-lecture" className="section-title">
                Grille de notation
              </h2>
              <span className="field-hint">
                Vous serez évalué sur ces critères ({atelier.grille.totalPonderations} %).
              </span>
            </div>
            <GrilleLecture criteres={atelier.grille.criteres} />
          </section>

          {succes !== null && <p className="alert alert-success depot-succes">{succes}</p>}
          {atelier.monLivrable && remplacer ? (
            <DepotLivrable
              atelier={atelier}
              versionActuelle={atelier.monLivrable.version}
              onAnnuler={() => setRemplacer(false)}
              onDepose={(livrable) => {
                setAtelier({ ...atelier, monLivrable: livrable });
                setRemplacer(false);
                setSucces(`Livrable remplacé (version ${livrable.version}) ✅`);
              }}
            />
          ) : atelier.monLivrable ? (
            <>
              <MonLivrable livrable={atelier.monLivrable} />
              {/* US-ATEL-05 : remplaçable avant la date limite, tant que SOUMIS. */}
              {atelier.monLivrable.statut === 'SOUMIS' && atelier.etatDepot === 'OUVERT' && (
                <div className="depot-remplacer">
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      setSucces(null);
                      setRemplacer(true);
                    }}
                  >
                    Remplacer mon livrable
                  </button>
                  <span className="field-hint">
                    Possible jusqu’à la date limite, tant que la correction n’a pas commencé.
                  </span>
                </div>
              )}
            </>
          ) : atelier.etatDepot === 'CLOS' ? (
            <p className="alert alert-error depot-succes">
              Le dépôt est clos : vous n’avez pas soumis de livrable pour cet atelier.
            </p>
          ) : (
            <DepotLivrable
              atelier={atelier}
              onDepose={(livrable) => {
                setAtelier({ ...atelier, monLivrable: livrable });
                setSucces(`Livrable soumis avec succès (version ${livrable.version}) ✅`);
              }}
            />
          )}
        </>
      )}
    </>
  );
}

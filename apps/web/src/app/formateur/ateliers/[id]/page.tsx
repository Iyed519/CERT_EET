'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AtelierModal } from '../../../../components/AtelierModal';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { AdminError, AtelierDetail, deleteAtelier, getAtelier } from '../../../../lib/api';
import { dateHeureFr, LIBELLES_STATUT_ATELIER } from '../../../../lib/format';

/** Ce qui est ouvert par-dessus la page (une modale à la fois). */
type Fenetre = { type: 'modifier' } | { type: 'supprimer' } | null;

/**
 * US-ATEL-01 — Fiche d'un atelier (formateur affecté, DS-13 partie 1).
 *
 * Résumé (date limite, livrables, modalités), énoncé et compétences visées.
 * Tant que l'atelier est en brouillon, il se modifie et se supprime ; le
 * serveur refuse (409) dès qu'il est publié, la page désactive alors les
 * boutons. La grille de notation arrive avec US-ATEL-02, la publication avec
 * US-ATEL-03.
 */
export default function AtelierPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const atelierId = params?.id ?? '';
  const [atelier, setAtelier] = useState<AtelierDetail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);

  const charger = useCallback(async (): Promise<void> => {
    if (!atelierId) return;
    setErreur(null);
    try {
      setAtelier(await getAtelier(atelierId));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger l’atelier.');
    } finally {
      setChargement(false);
    }
  }, [atelierId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const brouillon = atelier?.statut === 'BROUILLON';
  const raisonFige = 'Seul un atelier en brouillon se modifie ou se supprime.';

  return (
    <>
      {atelier && (
        <p className="back-link-row">
          <Link className="back-link" href={`/formateur/formations/${atelier.formationId}`}>
            ← Retour à la formation
          </Link>
        </p>
      )}

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
            <div className="row-actions">
              <span className={`statut-badge statut-${atelier.statut}`}>
                {LIBELLES_STATUT_ATELIER[atelier.statut]}
              </span>
              <button
                className="btn-sm"
                onClick={() => setFenetre({ type: 'modifier' })}
                disabled={!brouillon}
                title={brouillon ? undefined : raisonFige}
              >
                Modifier
              </button>
              <button
                className="btn-sm btn-danger"
                onClick={() => setFenetre({ type: 'supprimer' })}
                disabled={!brouillon}
                title={brouillon ? undefined : raisonFige}
              >
                Supprimer
              </button>
            </div>
          </div>

          {brouillon && (
            <p className="alert alert-info">
              Brouillon : invisible pour les apprenants. Définissez ensuite la grille de notation,
              puis publiez l’atelier.
            </p>
          )}

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
                  : `${atelier.toleranceRetardHeures} h`}
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

          <h2 className="section-title">Grille de notation</h2>
          <p className="page-subtitle espace-bas">
            À définir (US-ATEL-02) : critères pondérés, total de 100 %.
          </p>
        </>
      )}

      {fenetre?.type === 'modifier' && atelier && (
        <AtelierModal
          atelier={atelier}
          onClose={() => setFenetre(null)}
          onEnregistre={(maj) => {
            setAtelier(maj);
            setFenetre(null);
          }}
        />
      )}

      {fenetre?.type === 'supprimer' && atelier && (
        <ConfirmationModal
          titre="Supprimer l’atelier"
          message={`« ${atelier.titre} » sera définitivement supprimé.`}
          libelleAction="Supprimer"
          onConfirmer={async () => {
            await deleteAtelier(atelier.id);
            router.push(`/formateur/formations/${atelier.formationId}`);
          }}
          onClose={() => setFenetre(null)}
        />
      )}
    </>
  );
}

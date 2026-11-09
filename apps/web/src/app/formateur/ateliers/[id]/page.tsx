'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AtelierModal } from '../../../../components/AtelierModal';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { GrilleNotation } from '../../../../components/GrilleNotation';
import { LivrablesAtelier } from '../../../../components/LivrablesAtelier';
import {
  AdminError,
  AtelierDetail,
  deleteAtelier,
  getAtelier,
  GrilleNotation as Grille,
  publishAtelier,
} from '../../../../lib/api';
import { dateHeureFr, LIBELLES_STATUT_ATELIER } from '../../../../lib/format';

/** Ce qui est ouvert par-dessus la page (une modale à la fois). */
type Fenetre = { type: 'modifier' } | { type: 'supprimer' } | { type: 'publier' } | null;

/**
 * US-ATEL-01 — Fiche d'un atelier (formateur affecté, DS-13 partie 1).
 *
 * Résumé (date limite, livrables, modalités), énoncé et compétences visées.
 * Tant que l'atelier est en brouillon, il se modifie et se supprime ; le
 * serveur refuse (409) dès qu'il est publié, la page désactive alors les
 * boutons. En bas, l'éditeur de la grille de notation (US-ATEL-02).
 *
 * US-ATEL-03 — « Publier l'atelier » (DS-13 partie 3) : actif une fois la
 * grille validée ; une confirmation rappelle que l'atelier et sa grille se
 * figent. Le serveur revérifie tout (409 grille non validée, 400 date limite
 * passée) et son message s'affiche dans la modale.
 *
 * US-ATEL-06 — Une fois l'atelier publié, la liste de ses livrables (à
 * corriger, en correction, notés) s'affiche sous l'énoncé.
 */
export default function AtelierPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const atelierId = params?.id ?? '';
  const [atelier, setAtelier] = useState<AtelierDetail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [grilleValidee, setGrilleValidee] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const suivreGrille = useCallback((g: Grille) => setGrilleValidee(g.validee), []);

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
  const raisonPublication = grilleValidee
    ? undefined
    : 'Validez d’abord la grille de notation (total de 100 %).';

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
              {brouillon && (
                <button
                  className="btn-sm btn-primary-sm"
                  onClick={() => setFenetre({ type: 'publier' })}
                  disabled={!grilleValidee}
                  title={raisonPublication}
                >
                  Publier l’atelier
                </button>
              )}
            </div>
          </div>

          {succes !== null && <p className="alert alert-success atelier-annonce">{succes}</p>}
          {brouillon && (
            <p className="alert alert-info">
              Brouillon : invisible pour les apprenants.{' '}
              {grilleValidee
                ? 'La grille est validée : l’atelier peut être publié.'
                : 'Définissez la grille de notation (total de 100 %) et validez-la : la publication l’exige.'}
            </p>
          )}
          {atelier.statut === 'PUBLIE' && succes === null && (
            <p className="alert alert-info">
              Publié : visible des apprenants inscrits, avec sa grille. L’atelier et sa grille ne
              se modifient plus.
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

          {!brouillon && <LivrablesAtelier atelierId={atelier.id} />}

          <GrilleNotation
            key={atelier.statut}
            atelierId={atelier.id}
            titreAtelier={atelier.titre}
            onChange={suivreGrille}
          />
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

      {fenetre?.type === 'publier' && atelier && (
        <ConfirmationModal
          titre="Publier l’atelier"
          message={`« ${atelier.titre} » deviendra visible des apprenants inscrits, avec sa grille de notation, jusqu’au ${dateHeureFr(atelier.dateLimite)}. Ensuite, ni l’atelier ni sa grille ne pourront être modifiés.`}
          libelleAction="Publier"
          onConfirmer={async () => {
            setAtelier(await publishAtelier(atelier.id));
            setFenetre(null);
            setSucces('Atelier publié ✅ Visible aux apprenants inscrits.');
          }}
          onClose={() => setFenetre(null)}
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

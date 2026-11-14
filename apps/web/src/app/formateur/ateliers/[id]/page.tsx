'use client';
import { useMiettes } from '../../../../components/TitrePage';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AtelierModal } from '../../../../components/AtelierModal';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { GrilleNotation } from '../../../../components/GrilleNotation';
import { LivrablesAtelier } from '../../../../components/LivrablesAtelier';
import { EnTetePage } from '../../../../components/EnTetePage';
import { Etapes } from '../../../../components/Etapes';
import { Icone } from '../../../../components/Icone';
import { MenuActions } from '../../../../components/MenuActions';
import { Onglets, PanneauOnglet } from '../../../../components/Onglets';
import { PastilleStatut } from '../../../../components/PastilleStatut';
import {
  AdminError,
  AtelierDetail,
  deleteAtelier,
  getAtelier,
  GrilleNotation as Grille,
  publishAtelier,
} from '../../../../lib/api';
import { dateHeureFr, LIBELLES_STATUT_ATELIER } from '../../../../lib/format';

type OngletAtelier = 'enonce' | 'grille' | 'livrables';

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
 *
 * US-UX-05 — Même modèle que l'éditeur de QCM : bandeau d'étapes (énoncé,
 * grille, publication, correction et résultats) avec la prochaine action, et
 * onglets « Énoncé », « Grille de notation », « Livrables et résultats »
 * (compteur des livrables à corriger) ; « Modifier » et « Supprimer » dans ⋯.
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
  // US-UX-05 : onglet affiché (livrables d'abord une fois publié) et livrables à corriger.
  const [onglet, setOnglet] = useState<OngletAtelier | null>(null);
  const [aCorriger, setACorriger] = useState(0);
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
  const ongletAffiche: OngletAtelier = onglet ?? (brouillon ? 'grille' : 'livrables');
  // Un atelier publié a forcément une grille validée (la publication l'exige) ; en
  // brouillon, l'onglet « Grille » (ouvert d'abord) remonte son état.
  const grilleOk = grilleValidee || !brouillon;
  const raisonFige = 'Seul un atelier en brouillon se modifie ou se supprime.';
  const raisonPublication = grilleValidee
    ? undefined
    : 'Validez d’abord la grille de notation (total de 100 %).';

  useMiettes(atelier ? [{ href: `/formateur/formations/${atelier.formationId}`, libelle: 'La formation' }, { libelle: atelier.titre }] : null);
  return (
    <>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : atelier === null ? null : (
        <>
          <EnTetePage
            titre={atelier.titre}
            phrase={`Atelier du module « ${atelier.moduleTitre} » : définissez l’énoncé et la grille, publiez, puis corrigez les livrables déposés.`}
            statut={<PastilleStatut statut={atelier.statut} libelle={LIBELLES_STATUT_ATELIER[atelier.statut]} />}
            actions={
              <MenuActions
                contexte={atelier.titre}
                note={brouillon ? undefined : raisonFige}
                elements={[
                  { libelle: 'Modifier', icone: 'modifier', desactive: !brouillon, onClick: () => setFenetre({ type: 'modifier' }) },
                  {
                    libelle: 'Supprimer',
                    icone: 'supprimer',
                    danger: true,
                    separe: true,
                    desactive: !brouillon,
                    onClick: () => setFenetre({ type: 'supprimer' }),
                  },
                ]}
              />
            }
          />

          {succes !== null && <p className="alert alert-success atelier-annonce">{succes}</p>}

          <Etapes
            libelle="Parcours de l’atelier"
            etapes={[
              { libelle: 'Énoncé', etat: 'fait', detail: `à rendre avant le ${dateHeureFr(atelier.dateLimite)}`, onClick: ongletAffiche === 'enonce' ? undefined : () => setOnglet('enonce') },
              {
                libelle: 'Grille de notation',
                etat: grilleOk ? 'fait' : 'a-faire',
                detail: grilleOk ? 'validée (100 %)' : 'à valider (total de 100 %)',
                onClick: ongletAffiche === 'grille' ? undefined : () => setOnglet('grille'),
              },
              {
                libelle: 'Publication',
                etat: brouillon ? (grilleValidee ? 'a-faire' : 'bloquant') : 'fait',
                detail: brouillon ? (grilleValidee ? 'prête' : 'grille à valider d’abord') : 'visible des apprenants',
              },
              {
                libelle: 'Correction et résultats',
                etat: brouillon ? 'a-faire' : aCorriger > 0 ? 'en-cours' : 'fait',
                detail: brouillon ? 'après la publication' : aCorriger > 0 ? `${aCorriger} livrable${aCorriger > 1 ? 's' : ''} à corriger` : 'rien à corriger',
                onClick: brouillon || ongletAffiche === 'livrables' ? undefined : () => setOnglet('livrables'),
              },
            ]}
            action={
              brouillon ? (
                grilleValidee ? (
                  <button className="btn-sm btn-primary-sm" onClick={() => setFenetre({ type: 'publier' })} title={raisonPublication}>
                    <Icone nom="publier" taille={16} />
                    Publier l’atelier
                  </button>
                ) : (
                  <button className="btn-sm btn-primary-sm" onClick={() => setOnglet('grille')}>
                    <Icone nom="grille" taille={16} />
                    Compléter la grille
                  </button>
                )
              ) : aCorriger > 0 ? (
                <button
                  className="btn-sm btn-primary-sm"
                  onClick={() => {
                    setOnglet('livrables');
                    // Le premier livrable à corriger reçoit le focus.
                    window.setTimeout(() => {
                      document.querySelector<HTMLElement>('#atelier-panneau-livrables .livrable-ligne button.btn-primary-sm, #atelier-panneau-livrables button.btn-primary-sm')?.focus();
                    }, 50);
                  }}
                >
                  <Icone nom="correction" taille={16} />
                  Corriger les livrables
                </button>
              ) : null
            }
          />

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

          <Onglets
            libelle="Sections de l’atelier"
            idBase="atelier"
            actif={ongletAffiche}
            onChange={(o) => setOnglet(o as OngletAtelier)}
            onglets={[
              { id: 'enonce', libelle: 'Énoncé', icone: 'fichier' },
              { id: 'grille', libelle: 'Grille de notation', icone: 'grille' },
              ...(brouillon
                ? []
                : [{ id: 'livrables', libelle: 'Livrables et résultats', icone: 'livrable' as const, compteur: aCorriger, compteurAlerte: true }]),
            ]}
          />

          {ongletAffiche === 'enonce' && (
          <PanneauOnglet id="enonce" idBase="atelier">
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
          </PanneauOnglet>
          )}

          {ongletAffiche === 'grille' && (
          <PanneauOnglet id="grille" idBase="atelier">
            <GrilleNotation
              key={atelier.statut}
              atelierId={atelier.id}
              titreAtelier={atelier.titre}
              onChange={suivreGrille}
            />
          </PanneauOnglet>
          )}

          {!brouillon && ongletAffiche === 'livrables' && (
            <PanneauOnglet id="livrables" idBase="atelier">
              <LivrablesAtelier atelierId={atelier.id} onCompte={setACorriger} />
            </PanneauOnglet>
          )}
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

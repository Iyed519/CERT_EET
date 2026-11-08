'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  CritereGrille,
  deleteCritere,
  getGrille,
  GrilleNotation as Grille,
  reorderCriteres,
  validerGrille,
} from '../lib/api';
import { ConfirmationModal } from './ConfirmationModal';
import { CritereModal } from './CritereModal';
import { ChoisirModeleModal, EnregistrerModeleModal } from './ModeleGrilleModals';

/** Une modale à la fois. */
type Fenetre =
  | { type: 'critere'; critere?: CritereGrille }
  | { type: 'supprimer'; critere: CritereGrille }
  | { type: 'enregistrer-modele' }
  | { type: 'choisir-modele' }
  | null;

/**
 * US-ATEL-02 — Éditeur de la grille de notation pondérée d'un atelier
 * (DS-13 partie 2, UC4 Formateur), affiché sur la fiche de l'atelier.
 *
 * Barre de total en temps réel (rouge > 100, orange < 100, vert = 100),
 * critères avec leurs 4 niveaux, ajout / modification / suppression /
 * réordonnancement, « Valider la grille » actif à 100 % seulement, modèles.
 * Hors brouillon, la grille est en lecture seule (le serveur refuse en 409).
 * US-ATEL-03 — `onChange` informe la fiche de l'atelier de chaque état reçu du
 * serveur (le bouton « Publier » exige une grille validée).
 */
export function GrilleNotation({
  atelierId,
  titreAtelier,
  onChange,
}: {
  atelierId: string;
  titreAtelier: string;
  onChange?: (grille: Grille) => void;
}): JSX.Element {
  const [grille, setGrille] = useState<Grille | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setGrille(await getGrille(atelierId));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger la grille.');
    }
  }, [atelierId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (grille !== null) onChange?.(grille);
  }, [grille, onChange]);

  /** Une action qui renvoie la grille à jour ; l'erreur du serveur s'affiche telle quelle. */
  const agir = async (action: () => Promise<Grille>, message?: string): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      setGrille(await action());
      if (message) setSucces(message);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  };

  const recevoir = (maj: Grille, message: string): void => {
    setGrille(maj);
    setFenetre(null);
    setErreur(null);
    setSucces(message);
  };

  if (grille === null) {
    return (
      <>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {erreur === null && <p className="page-subtitle">Chargement de la grille…</p>}
      </>
    );
  }

  const total = grille.totalPonderations;
  const fige = !grille.modifiable;
  const etat = total > 100 ? 'depasse' : total === 100 ? 'ok' : 'incomplet';
  const deplacer = (index: number, sens: -1 | 1): Promise<void> => {
    const ids = grille.criteres.map((c) => c.id);
    [ids[index], ids[index + sens]] = [ids[index + sens], ids[index]];
    return agir(() => reorderCriteres(atelierId, ids));
  };

  return (
    <section className="grille" aria-labelledby="titre-grille">
      <div className="grille-tete">
        <h2 id="titre-grille" className="section-title grille-titre">
          Grille de notation
          {grille.validee ? (
            <span className="statut-badge badge-grille-validee">Grille validée ✅</span>
          ) : (
            grille.criteres.length > 0 && (
              <span className="statut-badge badge-grille-a-valider">À valider</span>
            )
          )}
        </h2>
        <div className="row-actions grille-actions">
          {!fige && (
            <button
              className="btn-sm"
              onClick={() => setFenetre({ type: 'choisir-modele' })}
              disabled={enCours}
            >
              Partir d’un modèle
            </button>
          )}
          <button
            className="btn-sm"
            onClick={() => setFenetre({ type: 'enregistrer-modele' })}
            disabled={enCours || total !== 100}
            title={total === 100 ? undefined : 'Seule une grille à 100 % devient un modèle.'}
          >
            Enregistrer comme modèle
          </button>
          {!fige && (
            <button
              className="btn-sm btn-primary-sm"
              onClick={() => setFenetre({ type: 'critere' })}
              disabled={enCours || total >= 100}
              title={total >= 100 ? 'Le total atteint déjà 100 %.' : undefined}
            >
              + Ajouter un critère
            </button>
          )}
        </div>
      </div>

      {fige && (
        <p className="alert alert-info">
          L’atelier n’est plus en brouillon : la grille est figée (lecture seule).
        </p>
      )}
      {erreur !== null && <p className="alert alert-error grille-message">{erreur}</p>}
      {succes !== null && <p className="alert alert-success grille-message">{succes}</p>}

      <div className={`total-barre total-${etat}`}>
        <div className="total-barre-texte">
          <span>
            Total des pondérations : <strong>{total} %</strong> / 100 %
          </span>
          <span className="total-barre-etat">
            {etat === 'ok'
              ? 'Complet'
              : etat === 'depasse'
                ? `${total - 100} % de trop`
                : `Il manque ${100 - total} %`}
          </span>
        </div>
        <div
          className="total-barre-piste"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(total, 100)}
          aria-label="Total des pondérations"
        >
          <div className="total-barre-remplie" style={{ width: `${Math.min(total, 100)}%` }} />
        </div>
      </div>

      {grille.criteres.length === 0 ? (
        <p className="page-subtitle">
          Aucun critère pour l’instant. Ajoutez des critères pondérés (par exemple Fonctionnement
          40 %, Sécurité 30 %, Documentation 15 %, Tests 15 %) ou partez d’un de vos modèles.
        </p>
      ) : (
        <ol className="criteres">
          {grille.criteres.map((c, index) => (
            <li key={c.id} className="critere">
              <div className="critere-tete">
                <span className="module-ordre">{c.ordre}</span>
                <div className="module-corps">
                  <p className="critere-intitule">
                    {c.intitule} <span className="critere-poids">{c.ponderation} %</span>
                  </p>
                  {c.description && <p className="critere-description">{c.description}</p>}
                </div>
                {!fige && (
                  <div className="row-actions critere-actions">
                    <button
                      className="btn-sm btn-icon"
                      aria-label={`Monter le critère ${c.intitule}`}
                      onClick={() => void deplacer(index, -1)}
                      disabled={enCours || index === 0}
                    >
                      ↑
                    </button>
                    <button
                      className="btn-sm btn-icon"
                      aria-label={`Descendre le critère ${c.intitule}`}
                      onClick={() => void deplacer(index, 1)}
                      disabled={enCours || index === grille.criteres.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      className="btn-sm"
                      onClick={() => setFenetre({ type: 'critere', critere: c })}
                      disabled={enCours}
                    >
                      Modifier
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => setFenetre({ type: 'supprimer', critere: c })}
                      disabled={enCours}
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
              <ul className="niveaux">
                {c.niveaux.map((n) => (
                  <li key={n.ordre} className={`niveau niveau-${n.ordre}`}>
                    <span className="niveau-libelle">{n.libelle}</span>
                    <span className="niveau-plage">
                      {n.pointsMinPct}–{n.pointsMaxPct} %
                    </span>
                    {n.descripteur && <span className="niveau-descripteur">{n.descripteur}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {!fige && (
        <div className="grille-pied">
          <span className="field-hint">
            {grille.validee
              ? 'Toute modification retirera la validation : il faudra revalider.'
              : total === 100
                ? 'Le total fait 100 % : la grille peut être validée.'
                : 'La validation exige un total d’exactement 100 %.'}
          </span>
          <button
            className="btn grille-valider"
            onClick={() =>
              void agir(
                () => validerGrille(atelierId),
                'Grille validée. Vous pouvez maintenant publier l’atelier.',
              )
            }
            disabled={enCours || total !== 100 || grille.validee}
          >
            {grille.validee ? 'Grille validée ✅' : 'Valider la grille'}
          </button>
        </div>
      )}

      {fenetre?.type === 'critere' && (
        <CritereModal
          atelierId={atelierId}
          critere={fenetre.critere}
          totalAutres={total - (fenetre.critere?.ponderation ?? 0)}
          onClose={() => setFenetre(null)}
          onEnregistre={(maj) =>
            recevoir(maj, fenetre.critere ? 'Critère modifié.' : 'Critère ajouté.')
          }
        />
      )}
      {fenetre?.type === 'supprimer' && (
        <ConfirmationModal
          titre="Supprimer le critère"
          message={`« ${fenetre.critere.intitule} » (${fenetre.critere.ponderation} %) sera retiré de la grille.`}
          libelleAction="Supprimer"
          onConfirmer={async () =>
            recevoir(await deleteCritere(atelierId, fenetre.critere.id), 'Critère supprimé.')
          }
          onClose={() => setFenetre(null)}
        />
      )}
      {fenetre?.type === 'enregistrer-modele' && (
        <EnregistrerModeleModal
          atelierId={atelierId}
          titreSuggere={`Grille — ${titreAtelier}`}
          onClose={() => setFenetre(null)}
          onEnregistre={(modele) => {
            setFenetre(null);
            setErreur(null);
            setSucces(`Modèle « ${modele.nomModele} » enregistré.`);
          }}
        />
      )}
      {fenetre?.type === 'choisir-modele' && (
        <ChoisirModeleModal
          atelierId={atelierId}
          nbCriteresActuels={grille.criteres.length}
          onClose={() => setFenetre(null)}
          onCopie={(maj) => recevoir(maj, 'Grille reprise du modèle. Vérifiez-la puis validez-la.')}
        />
      )}
    </section>
  );
}

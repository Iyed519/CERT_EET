'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ActionInscription } from '../../components/ActionInscription';
import { ConfirmationInscription } from '../../components/ConfirmationInscription';
import { useAuth } from '../../contexts/AuthContext';
import { AdminError, FormationCatalogueVue, getFormations } from '../../lib/api';
import { LIBELLES_INSCRIPTION, periodeFr } from '../../lib/format';

const PAR_PAGE = 20;

/**
 * US-INSC-01 — Catalogue des formations ouvertes (DS-08, étape 1).
 *
 * Pour chaque formation : période, places restantes et, pour un apprenant,
 * son inscription éventuelle. Une formation déjà suivie reste listée, marquée
 * de son statut (DS-08 la masquait). Le bouton « S’inscrire » n’apparaît que
 * pour un apprenant ; le serveur refait tous les contrôles (capacité,
 * ouverture, inscription existante).
 */
export default function CataloguePage(): JSX.Element {
  const { user } = useAuth();
  const estApprenant = user?.role === 'APPRENANT';
  const [formations, setFormations] = useState<FormationCatalogueVue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<FormationCatalogueVue | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await getFormations({ page, limit: PAR_PAGE });
      setFormations(resultat.items);
      setTotal(resultat.total);
    } catch (error) {
      setErreur(
        error instanceof AdminError ? error.message : 'Impossible de charger le catalogue.',
      );
    } finally {
      setChargement(false);
    }
  }, [page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const totalPages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Catalogue des formations</h1>
          <p className="page-subtitle">Les formations ouvertes aux inscriptions.</p>
        </div>
        <div className="row-actions">
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
        </div>
      </div>

      {succes !== null && (
        <p className="alert alert-success">
          {succes} <Link href="/mes-inscriptions">Voir mes inscriptions</Link>
        </p>
      )}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : erreur !== null ? null : formations.length === 0 ? (
        <p className="page-subtitle">Aucune formation n’est ouverte aux inscriptions pour l’instant.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th>Période</th>
                  <th>Places restantes</th>
                  {estApprenant && <th>Mon inscription</th>}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {formations.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link className="table-link" href={`/catalogue/${f.id}`}>
                        {f.titre}
                      </Link>
                      {f.dureeHeures !== null && (
                        <div className="muted-cell">{f.dureeHeures} h</div>
                      )}
                    </td>
                    <td>
                      {periodeFr(f.dateDebut, f.dateFin) ?? <span className="muted-cell">—</span>}
                    </td>
                    <td>
                      {f.placesRestantes === 0 ? (
                        <span className="statut-badge statut-COMPLETE">Complète</span>
                      ) : (
                        `${f.placesRestantes} / ${f.capaciteMax}`
                      )}
                    </td>
                    {estApprenant && (
                      <td>
                        {f.statutInscription === null ? (
                          <span className="muted-cell">—</span>
                        ) : (
                          <span className={`statut-badge statut-${f.statutInscription}`}>
                            {LIBELLES_INSCRIPTION[f.statutInscription]}
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="row-actions">
                        <Link className="btn-sm btn-link" href={`/catalogue/${f.id}`}>
                          Détails
                        </Link>
                        {estApprenant && (
                          <ActionInscription
                            formation={f}
                            onInscrire={() => {
                              setSucces(null);
                              setAConfirmer(f);
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <span className="page-subtitle">
                {total} formation(s) — page {page} / {totalPages}
              </span>
              <div className="row-actions">
                <button
                  className="btn-sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                >
                  Précédent
                </button>
                <button
                  className="btn-sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {aConfirmer !== null && (
        <ConfirmationInscription
          formation={aConfirmer}
          onClose={() => setAConfirmer(null)}
          onInscrit={(inscription) => {
            setAConfirmer(null);
            setSucces(`Vous êtes inscrit à la formation « ${inscription.formation.titre} ».`);
            void charger();
          }}
          onRefus={() => void charger()}
        />
      )}
    </>
  );
}

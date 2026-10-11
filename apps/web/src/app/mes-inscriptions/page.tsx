'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminError, getMesInscriptions, InscriptionVue } from '../../lib/api';
import { dateFr, jourFr, LIBELLES_INSCRIPTION, periodeFr } from '../../lib/format';

/**
 * US-INSC-01 — Mes inscriptions (apprenant).
 *
 * Toutes mes inscriptions, la plus récente d'abord, y compris suspendues :
 * l'apprenant doit voir pourquoi il n'a plus accès. Le titre mène à « Mon
 * espace » dans la formation (modules et évaluations, US-INSC-04), sauf si
 * l'inscription est suspendue : l'accès est alors fermé.
 */
export default function MesInscriptionsPage(): JSX.Element {
  const [inscriptions, setInscriptions] = useState<InscriptionVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setInscriptions(await getMesInscriptions());
    } catch (error) {
      setErreur(
        error instanceof AdminError && error.statut === 403
          ? 'Cet espace est réservé aux apprenants.'
          : error instanceof AdminError
            ? error.message
            : 'Impossible de charger vos inscriptions.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes inscriptions</h1>
          <p className="page-subtitle">Les formations auxquelles vous êtes inscrit.</p>
        </div>
        <div className="row-actions">
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : erreur !== null ? null : inscriptions.length === 0 ? (
        <p className="page-subtitle">
          Vous n’êtes inscrit à aucune formation pour l’instant.{' '}
          <Link href="/catalogue">Parcourir le catalogue</Link>
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Période</th>
                <th>Inscrit le</th>
                <th>Échéance</th>
                <th>Avancement</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {inscriptions.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.statut !== 'SUSPENDUE' ? (
                      <Link className="table-link" href={`/mes-inscriptions/${i.formation.id}`}>
                        {i.formation.titre}
                      </Link>
                    ) : (
                      i.formation.titre
                    )}
                  </td>
                  <td>
                    {periodeFr(i.formation.dateDebut, i.formation.dateFin) ?? (
                      <span className="muted-cell">—</span>
                    )}
                  </td>
                  <td>{jourFr(i.dateInscription)}</td>
                  <td>{dateFr(i.dateEcheance)}</td>
                  <td>{i.tauxAvancement} %</td>
                  <td>
                    <span className={`statut-badge statut-${i.statut}`}>
                      {LIBELLES_INSCRIPTION[i.statut]}
                    </span>
                    {i.statut === 'SUSPENDUE' && (
                      <div className="muted-cell">Contactez un administrateur</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

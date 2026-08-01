'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  getAuditLogs,
  downloadAuditLogsCsv,
  AuditLogEntry,
  AuditQuery,
  AdminError,
} from '../../../lib/api';

/** Nombre d'entrées par page (aligné sur le défaut du backend, DS-16). */
const LIMIT = 50;

/** Horodatage ISO -> affichage FR lisible (date + heure). */
function formatHorodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/**
 * US-AUTH-12 / DS-16 — Consultation du journal d'audit (ADMINISTRATEUR).
 *
 * Tableau filtrable (action, acteur, période), paginé, trié du plus récent au
 * plus ancien, + téléchargement CSV du résultat filtré. Lecture seule : aucune
 * action de modification/suppression n'existe (immuabilité NF3). La sécurité
 * réelle est côté API : un non-admin reçoit un 403 et ne voit aucune donnée.
 */
export default function AdminAuditPage(): JSX.Element {
  // Filtres APPLIQUÉS (déclenchent le chargement).
  const [filtres, setFiltres] = useState<AuditQuery>({ page: 1, limit: LIMIT });
  // Saisie EN COURS (appliquée seulement au clic sur « Filtrer »).
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await getAuditLogs(filtres);
      setItems(resultat.items);
      setTotal(resultat.total);
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : "Impossible de charger le journal d'audit.",
      );
    } finally {
      setChargement(false);
    }
  }, [filtres]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const appliquerFiltres = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFiltres({
      action: action.trim() || undefined,
      userId: userId.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      page: 1,
      limit: LIMIT,
    });
  };

  const reinitialiser = (): void => {
    setAction('');
    setUserId('');
    setFrom('');
    setTo('');
    setFiltres({ page: 1, limit: LIMIT });
  };

  const changerPage = (delta: number): void => {
    setFiltres((precedent) => ({
      ...precedent,
      page: Math.max(1, (precedent.page ?? 1) + delta),
    }));
  };

  const telecharger = async (): Promise<void> => {
    setExportEnCours(true);
    setErreur(null);
    try {
      // Export = MÊMES filtres que l'affichage, sans pagination (tout le résultat).
      await downloadAuditLogsCsv({
        action: filtres.action,
        userId: filtres.userId,
        from: filtres.from,
        to: filtres.to,
      });
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : "Impossible d'exporter le journal d'audit.",
      );
    } finally {
      setExportEnCours(false);
    }
  };

  const page = filtres.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Journal d&apos;audit</h1>
          <p className="page-subtitle">
            Trace inviolable des actions sensibles (US-AUTH-12, NF3). Lecture
            seule : aucune entrée ne peut être modifiée ni supprimée.
          </p>
        </div>
        <button
          className="btn-sm"
          onClick={() => void telecharger()}
          disabled={exportEnCours || chargement}
        >
          {exportEnCours ? 'Préparation…' : 'Télécharger (CSV)'}
        </button>
      </div>

      <form className="filters" onSubmit={appliquerFiltres}>
        <div className="field">
          <label className="field-label" htmlFor="f-action">
            Action
          </label>
          <input
            id="f-action"
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="ex. LOGIN, ROLE_CHANGE"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-user">
            Acteur (userId)
          </label>
          <input
            id="f-user"
            className="input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="UUID de l'utilisateur"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-from">
            Du
          </label>
          <input
            id="f-from"
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-to">
            Au
          </label>
          <input
            id="f-to"
            className="input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="filters-actions">
          <button type="submit" className="btn-sm" disabled={chargement}>
            Filtrer
          </button>
          <button
            type="button"
            className="btn-sm btn-ghost"
            onClick={reinitialiser}
            disabled={chargement}
          >
            Réinitialiser
          </button>
        </div>
      </form>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Horodatage</th>
                  <th>Action</th>
                  <th>Acteur</th>
                  <th>Cible</th>
                  <th>IP</th>
                  <th>Résultat</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entree) => (
                  <tr key={entree.id}>
                    <td>{formatHorodatage(entree.horodatage)}</td>
                    <td>{entree.action}</td>
                    <td className="mono">
                      {entree.userId ?? <span className="muted-cell">—</span>}
                    </td>
                    <td className="mono">
                      {entree.cible ?? <span className="muted-cell">—</span>}
                    </td>
                    <td className="mono">
                      {entree.adresseIp ?? (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td>
                      {entree.resultat ? (
                        <span
                          className={`res-badge ${
                            entree.resultat === 'Échec' ? 'res-ko' : 'res-ok'
                          }`}
                        >
                          {entree.resultat}
                        </span>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td className="mono">
                      {entree.detailsAvantApres ? (
                        JSON.stringify(entree.detailsAvantApres)
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted-cell">
                      Aucune entrée pour ces critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-subtitle">
              {total} entrée(s) — page {page} / {totalPages}
            </span>
            <div className="row-actions">
              <button
                className="btn-sm"
                onClick={() => changerPage(-1)}
                disabled={page <= 1}
              >
                Précédent
              </button>
              <button
                className="btn-sm"
                onClick={() => changerPage(1)}
                disabled={page >= totalPages}
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

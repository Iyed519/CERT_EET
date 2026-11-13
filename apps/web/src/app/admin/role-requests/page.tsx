'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { CroixFermeture } from '../../../components/CroixFermeture';
import {
  getAdminRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
  DemandeRoleAdminVue,
  StatutDemande,
  RoleDemande,
  AdminError,
} from '../../../lib/api';

/** Libellés FR des rôles demandés. */
const libelleRole = (r: RoleDemande): string =>
  r === 'ADMINISTRATEUR' ? 'Administrateur' : 'Formateur';

/** Libellés FR des statuts de demande + filtres proposés. */
const STATUTS: Array<[StatutDemande, string]> = [
  ['EN_ATTENTE', 'En attente'],
  ['APPROUVEE', 'Approuvée'],
  ['REJETEE', 'Rejetée'],
];
const libelleStatut = (s: StatutDemande): string =>
  STATUTS.find(([v]) => v === s)?.[1] ?? s;

const dateFr = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * US-ROL-02 (étape C/D) — Console admin des demandes de changement de rôle.
 * La sécurité réelle est côté API (@Roles(ADMINISTRATEUR)) : un non-admin qui
 * force l'URL reçoit un 403 et voit un message, sans fuite de données.
 */
export default function AdminRoleRequestsPage(): JSX.Element {
  const [demandes, setDemandes] = useState<DemandeRoleAdminVue[]>([]);
  const [filtre, setFiltre] = useState<StatutDemande>('EN_ATTENTE');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cibleRejet, setCibleRejet] = useState<DemandeRoleAdminVue | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const page = await getAdminRoleRequests({ statut: filtre });
      setDemandes(page.items);
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : 'Impossible de charger les demandes.',
      );
    } finally {
      setChargement(false);
    }
  }, [filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const approuver = useCallback(
    async (demande: DemandeRoleAdminVue): Promise<void> => {
      setSucces(null);
      setErreur(null);
      setBusyId(demande.id);
      try {
        const maj = await approveRoleRequest(demande.id);
        setSucces(
          `Demande de ${maj.demandeur.email} approuvée : rôle « ${libelleRole(
            maj.roleDemande,
          )} » appliqué, ses sessions ont été invalidées.`,
        );
        await charger();
      } catch (error) {
        setErreur(
          error instanceof AdminError
            ? error.message
            : "Impossible d'approuver la demande.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [charger],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Demandes de changement de rôle</h1>
          <p className="page-subtitle">
            Approuvez ou rejetez les demandes de changement de rôle : le demandeur est prévenu par email.
          </p>
        </div>
        <div className="row-actions">
          <select
            className="input"
            aria-label="Filtrer par statut"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value as StatutDemande)}
            disabled={chargement}
          >
            {STATUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="btn-sm"
            onClick={() => void charger()}
            disabled={chargement}
          >
            Actualiser
          </button>
        </div>
      </div>

      {succes !== null && <p className="alert alert-success">{succes}</p>}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Demandeur</th>
                <th>Rôle demandé</th>
                <th>Justification</th>
                <th>Date</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => {
                const nomComplet = [d.demandeur.prenom, d.demandeur.nom]
                  .filter(Boolean)
                  .join(' ');
                const enCours = busyId === d.id;
                return (
                  <tr key={d.id}>
                    <td>
                      <div>{nomComplet || <span className="muted-cell">—</span>}</div>
                      <div className="muted-cell">{d.demandeur.email}</div>
                    </td>
                    <td>
                      <span className="role-badge role-FORMATEUR">
                        {libelleRole(d.roleDemande)}
                      </span>
                    </td>
                    <td>{d.justification}</td>
                    <td>{dateFr(d.createdAt)}</td>
                    <td>
                      <span className={`statut-badge statut-${d.statut}`}>
                        {libelleStatut(d.statut)}
                      </span>
                      {d.statut === 'REJETEE' && d.motif && (
                        <div className="field-hint">Motif : {d.motif}</div>
                      )}
                    </td>
                    <td>
                      {d.statut === 'EN_ATTENTE' ? (
                        <div className="row-actions">
                          <button
                            className="btn-sm"
                            disabled={enCours}
                            onClick={() => void approuver(d)}
                          >
                            {enCours ? 'Application…' : 'Approuver'}
                          </button>
                          <button
                            className="btn-sm btn-danger"
                            disabled={enCours}
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleRejet(d);
                            }}
                          >
                            Rejeter
                          </button>
                        </div>
                      ) : (
                        <span className="muted-cell">Traitée</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {demandes.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted-cell">
                    Aucune demande {libelleStatut(filtre).toLowerCase()}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cibleRejet !== null && (
        <RejeterModal
          demande={cibleRejet}
          onClose={() => setCibleRejet(null)}
          onDone={(message) => {
            setCibleRejet(null);
            setSucces(message);
            void charger();
          }}
        />
      )}
    </>
  );
}

/** Modale de rejet : motif obligatoire (réutilise l'overlay/carte existants). */
function RejeterModal({
  demande,
  onClose,
  onDone,
}: {
  demande: DemandeRoleAdminVue;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const maj = await rejectRoleRequest(demande.id, motif.trim());
      onDone(`Demande de ${maj.demandeur.email} rejetée.`);
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : 'Une erreur est survenue. Veuillez réessayer.',
      );
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Rejeter la demande</h1>
        <p className="auth-subtitle">
          {demande.demandeur.email} — rôle demandé :{' '}
          {libelleRole(demande.roleDemande)}.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="motif-rejet">
              Motif du rejet
            </label>
            <textarea
              id="motif-rejet"
              className="input"
              rows={3}
              required
              maxLength={500}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              disabled={enCours}
              placeholder="Ex. : dossier incomplet, préciser les cours concernés…"
            />
            <span className="field-hint">
              Obligatoire : ce motif est tracé dans le journal d&apos;audit et
              communiqué au demandeur.
            </span>
          </div>
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-sm btn-ghost"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-danger-solid"
              disabled={enCours || motif.trim().length === 0}
            >
              {enCours ? 'Rejet…' : 'Rejeter'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

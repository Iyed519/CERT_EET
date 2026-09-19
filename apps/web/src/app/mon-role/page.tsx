'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  createRoleRequest,
  getMesDemandesRole,
  DemandeRoleVue,
  RoleDemande,
  StatutDemande,
  AdminError,
} from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

const ROLES: Array<[RoleDemande, string]> = [
  ['FORMATEUR', 'Formateur'],
  ['ADMINISTRATEUR', 'Administrateur'],
];
const libelleRole = (r: RoleDemande): string =>
  ROLES.find(([v]) => v === r)?.[1] ?? r;

const STATUTS_LIBELLE: Record<StatutDemande, string> = {
  EN_ATTENTE: 'En attente',
  APPROUVEE: 'Approuvée',
  REJETEE: 'Rejetée',
};

const dateFr = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * US-ROL-02 — Espace utilisateur : soumettre une demande de changement de rôle
 * et suivre son statut. Ouvert à tout utilisateur connecté (le backend refuse
 * un rôle déjà détenu ou une 2e demande en attente).
 */
export default function MonRolePage(): JSX.Element {
  const { user } = useAuth();
  const [demandes, setDemandes] = useState<DemandeRoleVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Rôles proposables : on retire celui déjà détenu (le backend le refuse en 400).
  const options = ROLES.filter(([v]) => v !== user?.role);
  const [roleDemande, setRoleDemande] = useState<RoleDemande>(
    options[0]?.[0] ?? 'FORMATEUR',
  );
  const [justification, setJustification] = useState('');
  const [enCours, setEnCours] = useState(false);

  const aUneDemandeEnAttente = demandes.some((d) => d.statut === 'EN_ATTENTE');

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setDemandes(await getMesDemandesRole());
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : 'Impossible de charger vos demandes.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    try {
      await createRoleRequest(roleDemande, justification.trim());
      setSucces('Votre demande a été enregistrée. Un administrateur la traitera.');
      setJustification('');
      await charger();
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
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Changer de rôle</h1>
          <p className="page-subtitle">
            Demandez à devenir formateur ou administrateur. Un administrateur
            approuvera ou rejettera votre demande (US-ROL-02).
          </p>
        </div>
      </div>

      {succes !== null && <p className="alert alert-success">{succes}</p>}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {aUneDemandeEnAttente ? (
        <p className="page-subtitle">
          Vous avez déjà une demande en attente : vous pourrez en soumettre une
          nouvelle une fois celle-ci traitée.
        </p>
      ) : options.length === 0 ? (
        <p className="page-subtitle">
          Aucun rôle supplémentaire à demander pour votre compte.
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
          <div className="field">
            <label className="field-label" htmlFor="role-demande">
              Rôle souhaité
            </label>
            <select
              id="role-demande"
              className="input"
              value={roleDemande}
              onChange={(e) => setRoleDemande(e.target.value as RoleDemande)}
              disabled={enCours}
            >
              {options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="justification">
              Justification
            </label>
            <textarea
              id="justification"
              className="input"
              rows={4}
              required
              maxLength={1000}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              disabled={enCours}
              placeholder="Expliquez pourquoi vous demandez ce rôle."
            />
            <span className="field-hint">
              {justification.length}/1000 caractères.
            </span>
          </div>
          <div className="modal-actions">
            <button
              type="submit"
              className="btn"
              disabled={enCours || justification.trim().length === 0}
            >
              {enCours ? 'Envoi…' : 'Soumettre la demande'}
            </button>
          </div>
        </form>
      )}

      <h2 className="page-title" style={{ fontSize: '1.1rem', marginTop: 28 }}>
        Mes demandes
      </h2>
      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rôle demandé</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Motif (si rejetée)</th>
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id}>
                  <td>{libelleRole(d.roleDemande)}</td>
                  <td>{dateFr(d.createdAt)}</td>
                  <td>
                    <span className={`statut-badge statut-${d.statut}`}>
                      {STATUTS_LIBELLE[d.statut]}
                    </span>
                  </td>
                  <td>{d.motif ?? <span className="muted-cell">—</span>}</td>
                </tr>
              ))}
              {demandes.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted-cell">
                    Aucune demande pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

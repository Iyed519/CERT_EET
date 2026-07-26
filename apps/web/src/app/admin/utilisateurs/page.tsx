'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  getAdminUsers,
  changeUserRole,
  AdminUser,
  RoleUtilisateur,
  AdminError,
} from '../../../lib/api';

/** Libellés FR des rôles (l'enum backend reste la source de vérité). */
const ROLES: Array<[RoleUtilisateur, string]> = [
  ['APPRENANT', 'Apprenant'],
  ['FORMATEUR', 'Formateur'],
  ['ADMINISTRATEUR', 'Administrateur'],
];
const libelleRole = (role: RoleUtilisateur): string =>
  ROLES.find(([valeur]) => valeur === role)?.[1] ?? role;

/**
 * US-ROL-01 — Console d'administration : liste des utilisateurs + changement de
 * rôle. Page cliente (App Router). La sécurité réelle est côté API
 * (@Roles(ADMINISTRATEUR)) : si un non-admin force l'URL, getAdminUsers reçoit
 * un 403 et on affiche un message, aucune donnée ne fuit.
 */
export default function AdminUsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Utilisateur dont on édite le rôle (null = modale fermée).
  const [cible, setCible] = useState<AdminUser | null>(null);

  // useCallback : référence stable -> satisfait exhaustive-deps et permet de
  // réutiliser le chargement pour « Actualiser » et après un changement.
  const chargerUsers = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setUsers(await getAdminUsers());
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : 'Impossible de charger les utilisateurs.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void chargerUsers();
  }, [chargerUsers]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Gestion des utilisateurs</h1>
          <p className="page-subtitle">
            Consultez les comptes et modifiez leur rôle (US-ROL-01).
          </p>
        </div>
        <button
          className="btn-sm"
          onClick={() => void chargerUsers()}
          disabled={chargement}
        >
          Actualiser
        </button>
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
                <th>Utilisateur</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((utilisateur) => {
                const nomComplet = [utilisateur.prenom, utilisateur.nom]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={utilisateur.id}>
                    <td>
                      {nomComplet || <span className="muted-cell">—</span>}
                    </td>
                    <td>{utilisateur.email}</td>
                    <td>
                      <span className={`role-badge role-${utilisateur.role}`}>
                        {libelleRole(utilisateur.role)}
                      </span>
                    </td>
                    <td className="muted-cell">{utilisateur.statut}</td>
                    <td>
                      <button
                        className="btn-sm"
                        onClick={() => {
                          setSucces(null);
                          setCible(utilisateur);
                        }}
                      >
                        Changer le rôle
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted-cell">
                    Aucun utilisateur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cible !== null && (
        <ChangeRoleModal
          user={cible}
          onClose={() => setCible(null)}
          onDone={(message) => {
            setCible(null);
            setSucces(message);
            void chargerUsers();
          }}
        />
      )}
    </>
  );
}

/**
 * Modale de changement de rôle. Réutilise l'overlay/carte d'US-AUTH-15
 * (.profil-overlay / .profil-card). Exige le mot de passe admin (step-up).
 */
function ChangeRoleModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  // On propose tous les rôles SAUF l'actuel : le backend refuse un rôle
  // identique (400), autant ne pas l'offrir.
  const options = ROLES.filter(([valeur]) => valeur !== user.role);
  const [nouveauRole, setNouveauRole] = useState<RoleUtilisateur>(
    options[0][0],
  );
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const maj = await changeUserRole(user.id, nouveauRole, motDePasse);
      onDone(
        `Rôle de ${maj.email} changé en « ${libelleRole(maj.role)} ». ` +
          'Ses sessions ont été invalidées.',
      );
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
      <section className="profil-card">
        <h1 className="auth-title">Changer le rôle</h1>
        <p className="auth-subtitle">
          {user.email} — rôle actuel : {libelleRole(user.role)}.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="nouveau-role">
              Nouveau rôle
            </label>
            <select
              id="nouveau-role"
              className="input"
              value={nouveauRole}
              onChange={(e) =>
                setNouveauRole(e.target.value as RoleUtilisateur)
              }
              disabled={enCours}
            >
              {options.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="mdp-admin">
              Votre mot de passe administrateur
            </label>
            <input
              id="mdp-admin"
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              disabled={enCours}
              placeholder="Confirmez votre identité"
            />
            <span className="field-hint">
              Action sensible : votre mot de passe est requis (US-ROL-01).
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
            <button type="submit" className="btn" disabled={enCours}>
              {enCours ? 'Application…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

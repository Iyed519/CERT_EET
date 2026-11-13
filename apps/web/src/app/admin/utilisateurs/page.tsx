'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { CroixFermeture } from '../../../components/CroixFermeture';
import {
  getAdminUsers,
  changeUserRole,
  changeUserStatut,
  renvoyerActivation,
  AdminUser,
  RoleUtilisateur,
  AdminError,
} from '../../../lib/api';
import ImportComptesModal from '../../../components/ImportComptesModal';
import AnonymiserModal from '../../../components/AnonymiserModal';
import { useAuth } from '../../../contexts/AuthContext';

/** Libellés FR des rôles (l'enum backend reste la source de vérité). */
const ROLES: Array<[RoleUtilisateur, string]> = [
  ['APPRENANT', 'Apprenant'],
  ['FORMATEUR', 'Formateur'],
  ['ADMINISTRATEUR', 'Administrateur'],
];
const libelleRole = (role: RoleUtilisateur): string =>
  ROLES.find(([valeur]) => valeur === role)?.[1] ?? role;

/** Libellés FR des statuts de compte (StatutCompte côté backend). */
const STATUTS_LIBELLE: Record<string, string> = {
  ACTIF: 'Actif',
  DESACTIVE: 'Désactivé',
  EN_ATTENTE_ACTIVATION: 'En attente',
  ANONYMISE: 'Anonymisé',
};
const libelleStatut = (statut: string): string =>
  STATUTS_LIBELLE[statut] ?? statut;

/**
 * US-ROL-01 / US-CPT-03 — Console d'administration : liste des utilisateurs,
 * changement de rôle et gestion du statut (désactiver / réactiver). Page cliente
 * (App Router). La sécurité réelle est côté API (@Roles(ADMINISTRATEUR)) : si un
 * non-admin force l'URL, getAdminUsers reçoit un 403 et on affiche un message,
 * aucune donnée ne fuit.
 */
export default function AdminUsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Utilisateur dont on édite le rôle (null = modale fermée).
  const [cibleRole, setCibleRole] = useState<AdminUser | null>(null);
  // Utilisateur qu'on s'apprête à désactiver (saisie du motif ; null = fermée).
  const [cibleDesactivation, setCibleDesactivation] = useState<AdminUser | null>(
    null,
  );
  // Ligne dont une action de statut est en cours (désactive les boutons).
  const [busyId, setBusyId] = useState<string | null>(null);
  // US-CPT-02 : modale d'import CSV.
  const [importOuvert, setImportOuvert] = useState(false);
  // US-CPT-04 : compte à anonymiser (null = modale fermée).
  const [cibleAnonymisation, setCibleAnonymisation] = useState<AdminUser | null>(null);
  const { user: moi } = useAuth();

  async function renvoyer(utilisateur: AdminUser): Promise<void> {
    setSucces(null);
    setErreur(null);
    setBusyId(utilisateur.id);
    try {
      await renvoyerActivation(utilisateur.id);
      setSucces(`Un nouvel email d’activation va être envoyé à ${utilisateur.email}.`);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Une erreur est survenue.');
    } finally {
      setBusyId(null);
    }
  }

  // useCallback : référence stable -> satisfait exhaustive-deps et permet de
  // réutiliser le chargement pour « Actualiser » et après une action.
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

  // Réactivation : action directe (pas de motif requis), avec confirmation
  // visuelle via le message de succès.
  const reactiver = useCallback(
    async (utilisateur: AdminUser): Promise<void> => {
      setSucces(null);
      setErreur(null);
      setBusyId(utilisateur.id);
      try {
        const maj = await changeUserStatut(utilisateur.id, 'ACTIF');
        setSucces(`Le compte ${maj.email} a été réactivé.`);
        await chargerUsers();
      } catch (error) {
        setErreur(
          error instanceof AdminError
            ? error.message
            : 'Impossible de réactiver le compte.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [chargerUsers],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Gestion des utilisateurs</h1>
          <p className="page-subtitle">
            Consultez les comptes, importez-en depuis un fichier CSV, modifiez
            leur rôle et gérez leur statut.
          </p>
        </div>
        <div className="page-head-actions">
          <button
            className="btn-sm"
            onClick={() => {
              setSucces(null);
              setImportOuvert(true);
            }}
          >
            Importer un CSV
          </button>
          <button
            className="btn-sm"
            onClick={() => void chargerUsers()}
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
        <div className="table-wrap table-wrap-compacte">
          <table className="data-table table-compacte">
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
                const enCours = busyId === utilisateur.id;
                return (
                  <tr key={utilisateur.id}>
                    <th scope="row">
                      {nomComplet || <span className="muted-cell">—</span>}
                    </th>
                    <td data-libelle="E-mail">{utilisateur.email}</td>
                    <td data-libelle="Rôle">
                      <span className={`role-badge role-${utilisateur.role}`}>
                        {libelleRole(utilisateur.role)}
                      </span>
                    </td>
                    <td data-libelle="Statut">
                      <span
                        className={`statut-badge statut-${utilisateur.statut}`}
                      >
                        {libelleStatut(utilisateur.statut)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {utilisateur.statut !== 'ANONYMISE' && (
                          <button
                            className="btn-sm"
                            disabled={enCours}
                            onClick={() => {
                              setSucces(null);
                              setCibleRole(utilisateur);
                            }}
                          >
                            Changer le rôle
                          </button>
                        )}
                        {utilisateur.statut === 'ACTIF' && (
                          <button
                            className="btn-sm btn-danger"
                            disabled={enCours}
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleDesactivation(utilisateur);
                            }}
                          >
                            Désactiver
                          </button>
                        )}
                        {utilisateur.statut === 'EN_ATTENTE_ACTIVATION' && (
                          <button
                            className="btn-sm"
                            disabled={enCours}
                            onClick={() => void renvoyer(utilisateur)}
                          >
                            Renvoyer l’activation
                          </button>
                        )}
                        {utilisateur.statut === 'DESACTIVE' && (
                          <button
                            className="btn-sm"
                            disabled={enCours}
                            onClick={() => void reactiver(utilisateur)}
                          >
                            {enCours ? 'Réactivation…' : 'Réactiver'}
                          </button>
                        )}
                        {utilisateur.statut !== 'ANONYMISE' && utilisateur.id !== moi?.id && (
                          <button
                            className="btn-sm btn-danger"
                            disabled={enCours}
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleAnonymisation(utilisateur);
                            }}
                          >
                            Anonymiser
                          </button>
                        )}
                      </div>
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

      {cibleAnonymisation !== null && (
        <AnonymiserModal
          user={cibleAnonymisation}
          onClose={() => setCibleAnonymisation(null)}
          onDone={(message) => {
            setCibleAnonymisation(null);
            setSucces(message);
            void chargerUsers();
          }}
        />
      )}

      {importOuvert && (
        <ImportComptesModal
          onClose={() => setImportOuvert(false)}
          onImporte={(message) => {
            setSucces(message);
            void chargerUsers();
          }}
        />
      )}

      {cibleRole !== null && (
        <ChangeRoleModal
          user={cibleRole}
          onClose={() => setCibleRole(null)}
          onDone={(message) => {
            setCibleRole(null);
            setSucces(message);
            void chargerUsers();
          }}
        />
      )}

      {cibleDesactivation !== null && (
        <DesactiverModal
          user={cibleDesactivation}
          onClose={() => setCibleDesactivation(null)}
          onDone={(message) => {
            setCibleDesactivation(null);
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
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
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
              Action sensible : votre mot de passe est requis.
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

/**
 * US-CPT-03 — Modale de désactivation : saisie du motif (obligatoire). Réutilise
 * l'overlay/carte d'US-AUTH-15. Pas de mot de passe admin (pas de step-up sur
 * cette action, contrairement au changement de rôle).
 */
function DesactiverModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
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
      const maj = await changeUserStatut(user.id, 'DESACTIVE', motif.trim());
      onDone(
        `Le compte ${maj.email} a été désactivé. ` +
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
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Désactiver le compte</h1>
        <p className="auth-subtitle">
          {user.email} — l&apos;utilisateur perdra immédiatement l&apos;accès à
          la plateforme.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="motif-desactivation">
              Motif de la désactivation
            </label>
            <textarea
              id="motif-desactivation"
              className="input"
              rows={3}
              required
              maxLength={500}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              disabled={enCours}
              placeholder="Ex. : départ de l'entreprise, suspension disciplinaire…"
            />
            <span className="field-hint">
              Obligatoire : ce motif est conservé dans le journal d&apos;audit.
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
              {enCours ? 'Désactivation…' : 'Désactiver'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

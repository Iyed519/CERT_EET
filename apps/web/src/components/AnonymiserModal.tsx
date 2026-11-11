'use client';
import { FormEvent, useState } from 'react';
import { CroixFermeture } from './CroixFermeture';
import { AdminError, AdminUser, anonymiserCompte } from '../lib/api';

const MOT = 'ANONYMISER';

/**
 * US-CPT-04 — Anonymisation RGPD d'un compte (droit à l'oubli). Action
 * IRRÉVERSIBLE : la modale explique ce qui est effacé et conservé, puis exige
 * le mot de passe de l'administrateur ET le mot « ANONYMISER » recopié.
 */
export default function AnonymiserModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await anonymiserCompte(user.id, motDePasse, confirmation);
      onDone(
        'Compte anonymisé : identité et données personnelles effacées, sessions fermées. Les résultats et certificats sont conservés sans identité.',
      );
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Une erreur est survenue.');
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-anonymiser">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title" id="titre-anonymiser">
          Anonymiser le compte
        </h1>
        <p className="auth-subtitle anonymiser-cible">{user.email}</p>
        <p className="alert alert-error">
          Action <strong>irréversible</strong> (droit à l’oubli, RGPD).
        </p>
        <ul className="anonymiser-liste">
          <li>
            <strong>Effacés :</strong> nom, prénom, adresse email, mot de passe, double
            authentification, profil, connexions Google / GitHub, traces de connexion.
          </li>
          <li>
            <strong>Conservés sans identité :</strong> tentatives, livrables, corrections,
            certificats (toujours vérifiables, titulaire masqué) et journal d’audit.
          </li>
          <li>Toutes les sessions de la personne sont fermées immédiatement.</li>
        </ul>
        <form className="form" onSubmit={valider}>
          <div className="field">
            <label className="field-label" htmlFor="mdp-anonymiser">
              Votre mot de passe administrateur
            </label>
            <input
              id="mdp-anonymiser"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="confirmation-anonymiser">
              Recopiez « {MOT} » pour confirmer
            </label>
            <input
              id="confirmation-anonymiser"
              className="input"
              type="text"
              autoComplete="off"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={enCours}
            />
          </div>
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button className="btn-sm btn-ghost" type="button" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button
              className="btn btn-danger-solid"
              type="submit"
              disabled={enCours || confirmation !== MOT || motDePasse.length === 0}
            >
              {enCours ? 'Anonymisation…' : 'Anonymiser définitivement'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

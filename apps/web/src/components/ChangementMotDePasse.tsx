'use client';
import { FormEvent, useState } from 'react';
import { changerMotDePasse, ChangementMotDePasseError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/** Même politique que l'API (US-AUTH-08) : vérifiée ici pour guider la saisie. */
function problemePolitique(motDePasse: string): string | null {
  if (motDePasse.length < 8) return 'Au moins 8 caractères.';
  if (motDePasse.length > 72) return '72 caractères au plus.';
  if (!/[A-Za-z]/.test(motDePasse) || !/\d/.test(motDePasse)) {
    return 'Au moins une lettre et un chiffre.';
  }
  return null;
}

/**
 * US-AUTH-08 — Changer son mot de passe depuis « Sécurité ». En cas de
 * succès, TOUTES les sessions sont fermées côté serveur (celle-ci comprise) :
 * on efface la session locale et on renvoie vers la connexion avec un message.
 */
export default function ChangementMotDePasse(): JSX.Element {
  const { clearSession } = useAuth();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const probleme = nouveau.length > 0 ? problemePolitique(nouveau) : null;
  const differents = confirmation.length > 0 && confirmation !== nouveau;
  const pret =
    actuel.length > 0 && nouveau.length > 0 && probleme === null && confirmation === nouveau;

  async function valider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!pret) return;
    if (nouveau === actuel) {
      setErreur("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      await changerMotDePasse(actuel, nouveau);
      clearSession();
      window.location.href = '/login?motdepasse=modifie';
    } catch (error) {
      setErreur(
        error instanceof ChangementMotDePasseError
          ? error.message
          : 'Une erreur est survenue. Veuillez réessayer.',
      );
      setEnCours(false);
    }
  }

  return (
    <section className="securite-bloc" aria-labelledby="titre-mot-de-passe">
      <h2 className="section-title" id="titre-mot-de-passe">
        Mot de passe
      </h2>
      <p className="page-subtitle">
        Après le changement, toutes vos sessions (sur tous vos appareils) sont
        déconnectées : vous vous reconnecterez avec le nouveau mot de passe.
      </p>
      <form className="form" onSubmit={valider}>
        <div className="field">
          <label className="field-label" htmlFor="mdp-actuel">
            Mot de passe actuel
          </label>
          <input
            id="mdp-actuel"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={actuel}
            onChange={(e) => setActuel(e.target.value)}
            disabled={enCours}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mdp-nouveau">
            Nouveau mot de passe
          </label>
          <input
            id="mdp-nouveau"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            maxLength={72}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            disabled={enCours}
            aria-describedby="mdp-regle"
          />
          <span className="field-hint" id="mdp-regle">
            {probleme ?? 'Au moins 8 caractères, dont une lettre et un chiffre.'}
          </span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mdp-confirmation">
            Confirmer le nouveau mot de passe
          </label>
          <input
            id="mdp-confirmation"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            maxLength={72}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={enCours}
          />
          {differents && (
            <span className="field-hint">Les deux saisies ne correspondent pas.</span>
          )}
        </div>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <div className="modal-actions">
          <button className="btn" type="submit" disabled={enCours || !pret}>
            {enCours ? 'Modification…' : 'Changer mon mot de passe'}
          </button>
        </div>
      </form>
    </section>
  );
}

'use client';
import { useState, FormEvent } from 'react';
import { registerRequest, RegisterError } from '../../lib/api';
/**
 * Page d'auto-inscription publique (US-CPT-05, ADR-11).
 *
 * Formulaire ouvert (prénom, nom, email, mot de passe) -> POST /api/auth/register.
 * On NE connecte PAS l'utilisateur : le backend crée un compte APPRENANT en
 * attente de vérification et envoie un email. En cas de succès, on remplace le
 * formulaire par un message invitant à consulter sa boîte mail.
 */
export default function RegisterPage(): JSX.Element {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [succes, setSucces] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await registerRequest({ nom, prenom, email, password });
      setSucces(true);
    } catch (error) {
      if (error instanceof RegisterError) {
        setErreur(error.message);
      } else {
        setErreur('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setEnCours(false);
    }
  }
  if (succes) {
    return (
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Vérifiez votre email</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          Un email de vérification a été envoyé à <strong>{email}</strong>.
          Cliquez sur le lien reçu par email pour activer votre compte, puis
          connectez-vous.
        </p>
        <a href="/login" style={{ color: 'var(--primary)' }}>
          Aller à la connexion
        </a>
      </section>
    );
  }
  return (
    <section style={cardStyle}>
      <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Créer un compte</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Inscrivez-vous pour accéder à Cert_EET.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
      >
        <label style={labelStyle}>
          <span style={{ fontSize: '0.85rem' }}>Prénom</span>
          <input
            type="text"
            name="prenom"
            autoComplete="given-name"
            required
            maxLength={100}
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ fontSize: '0.85rem' }}>Nom</span>
          <input
            type="text"
            name="nom"
            autoComplete="family-name"
            required
            maxLength={100}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ fontSize: '0.85rem' }}>Adresse e-mail</span>
          <input
            type="email"
            name="email"
            placeholder="prenom.nom@exemple.tn"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ fontSize: '0.85rem' }}>Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={enCours}
            style={inputStyle}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Au moins 8 caractères, avec une lettre et un chiffre.
          </span>
        </label>
        {erreur !== null && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: 0 }}>
            {erreur}
          </p>
        )}
        <button
          type="submit"
          disabled={enCours}
          style={{
            ...buttonStyle,
            opacity: enCours ? 0.7 : 1,
            cursor: enCours ? 'not-allowed' : 'pointer',
          }}
        >
          {enCours ? 'Création...' : 'Créer mon compte'}
        </button>
      </form>
      <p style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
        Déjà un compte ?{' '}
        <a href="/login" style={{ color: 'var(--primary)' }}>
          Se connecter
        </a>
      </p>
    </section>
  );
}
const cardStyle: React.CSSProperties = {
  maxWidth: 380,
  margin: '2rem auto',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '2rem',
};
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: '0.95rem',
};
const buttonStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.7rem',
  border: 'none',
  borderRadius: 8,
  background: 'var(--primary)',
  color: '#fff',
  fontWeight: 600,
};

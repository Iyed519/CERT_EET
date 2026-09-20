'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  getMe,
  mfaSetup,
  mfaEnable,
  mfaDisable,
  MfaSetupResponse,
  MfaError,
  ProfilError,
} from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

/**
 * US-AUTH-09 — Réglages de sécurité : activer / désactiver la double
 * authentification (MFA/TOTP). Self-service, tout utilisateur connecté.
 */
export default function SecuritePage(): JSX.Element {
  const { user } = useAuth();
  const [mfaActive, setMfaActive] = useState<boolean | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Flux d'activation : setup renvoie le QR à scanner, puis on confirme un code.
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  // Flux de désactivation : on demande un code.
  const [desactivation, setDesactivation] = useState(false);
  const [code, setCode] = useState('');

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const profil = await getMe();
      setMfaActive(profil.mfaActive);
    } catch (error) {
      setErreur(
        error instanceof ProfilError
          ? error.message
          : 'Impossible de charger vos réglages de sécurité.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function demarrerActivation(): Promise<void> {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    try {
      setSetupData(await mfaSetup());
      setCode('');
    } catch (error) {
      setErreur(
        error instanceof MfaError ? error.message : 'Une erreur est survenue.',
      );
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerActivation(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await mfaEnable(code);
      setSetupData(null);
      setCode('');
      setSucces('Double authentification activée.');
      await charger();
    } catch (error) {
      setErreur(
        error instanceof MfaError ? error.message : 'Une erreur est survenue.',
      );
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerDesactivation(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await mfaDisable(code);
      setDesactivation(false);
      setCode('');
      setSucces('Double authentification désactivée.');
      await charger();
    } catch (error) {
      setErreur(
        error instanceof MfaError ? error.message : 'Une erreur est survenue.',
      );
    } finally {
      setEnCours(false);
    }
  }

  if (!user) {
    return (
      <p className="page-subtitle">
        Vous devez être connecté. <a href="/login">Se connecter →</a>
      </p>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sécurité</h1>
          <p className="page-subtitle">
            Protégez votre compte avec la double authentification (TOTP), via une
            application type Google Authenticator (US-AUTH-09).
          </p>
        </div>
      </div>

      {succes !== null && <p className="alert alert-success">{succes}</p>}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : mfaActive ? (
        <div style={{ maxWidth: 520 }}>
          <p className="alert alert-success">
            La double authentification est <strong>activée</strong> sur votre
            compte.
          </p>
          {!desactivation ? (
            <button
              className="btn-sm btn-danger"
              type="button"
              onClick={() => {
                setDesactivation(true);
                setCode('');
                setErreur(null);
                setSucces(null);
              }}
            >
              Désactiver la double authentification
            </button>
          ) : (
            <form className="form" onSubmit={confirmerDesactivation}>
              <div className="field">
                <label className="field-label" htmlFor="code-off">
                  Code de vérification
                </label>
                <input
                  id="code-off"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  disabled={enCours}
                />
                <span className="field-hint">
                  Saisissez un code de votre application pour confirmer la
                  désactivation.
                </span>
              </div>
              <div className="modal-actions">
                <button
                  className="btn-sm btn-ghost"
                  type="button"
                  onClick={() => {
                    setDesactivation(false);
                    setCode('');
                  }}
                  disabled={enCours}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-danger-solid"
                  type="submit"
                  disabled={enCours || code.length !== 6}
                >
                  {enCours ? 'Désactivation…' : 'Confirmer la désactivation'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 520 }}>
          {!setupData ? (
            <>
              <p className="page-subtitle">
                La double authentification n’est pas activée.
              </p>
              <button
                className="btn"
                type="button"
                onClick={demarrerActivation}
                disabled={enCours}
              >
                {enCours ? 'Préparation…' : 'Activer la double authentification'}
              </button>
            </>
          ) : (
            <>
              <p className="page-subtitle">
                1. Scannez ce QR code dans votre application d’authentification
                (Google Authenticator, Authy…).
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrDataUrl}
                alt="QR code d'activation de la double authentification"
                width={200}
                height={200}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fff',
                  padding: 8,
                }}
              />
              <p
                className="field-hint"
                style={{ wordBreak: 'break-all', marginTop: 8 }}
              >
                Clé manuelle :{' '}
                <span className="mono">{extraireSecret(setupData.otpauthUrl)}</span>
              </p>
              <form
                className="form"
                onSubmit={confirmerActivation}
                style={{ marginTop: 12 }}
              >
                <div className="field">
                  <label className="field-label" htmlFor="code-on">
                    2. Code de vérification
                  </label>
                  <input
                    id="code-on"
                    className="input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="123456"
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    disabled={enCours}
                  />
                </div>
                <div className="modal-actions">
                  <button
                    className="btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      setSetupData(null);
                      setCode('');
                    }}
                    disabled={enCours}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn"
                    type="submit"
                    disabled={enCours || code.length !== 6}
                  >
                    {enCours ? 'Activation…' : 'Activer'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Extrait le secret base32 du paramètre ?secret= de l'URI otpauth (affichage
// de secours si l'utilisateur ne peut pas scanner le QR).
function extraireSecret(otpauthUrl: string): string {
  try {
    return new URL(otpauthUrl).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

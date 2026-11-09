'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  CertificatAdmin,
  getCertificatsAdmin,
  MotifRevocation,
  relancerCertificat,
  revoquerCertificat,
  StatutCertificat,
} from '../../../lib/api';
import {
  dateHeureFr,
  LIBELLES_MOTIF_REVOCATION,
  LIBELLES_STATUT_CERTIFICAT,
  nomApprenantFr,
  nombreFr,
} from '../../../lib/format';

const FILTRES: Array<{ valeur: StatutCertificat | null; libelle: string }> = [
  { valeur: null, libelle: 'Tous' },
  { valeur: 'EN_ATTENTE_GENERATION', libelle: 'En attente' },
  { valeur: 'EN_GENERATION', libelle: 'En génération' },
  { valeur: 'ACTIF', libelle: 'Émis' },
  { valeur: 'REVOQUE', libelle: 'Révoqués' },
];

/**
 * US-CERT-01 — Suivi de l'émission des certificats (administrateur, DS-04).
 *
 * Les certificats sont générés en arrière-plan (file BullMQ). Ici : statut,
 * score et mention, empreinte SHA-256 une fois émis, nombre de tentatives et
 * dernière erreur. « Relancer » remet en file un certificat en attente (après
 * trois échecs) ou bloqué en génération ; le serveur refuse (409) un
 * certificat émis ou révoqué. La liste se rafraîchit d'elle-même tant qu'une
 * génération est en cours.
 *
 * US-CERT-06 — « Révoquer » (certificat émis) ouvre une modale : motif,
 * description interne, case d'irréversibilité et mot de passe (DS-07). Un
 * certificat révoqué affiche la date, le motif et la description.
 */
export default function CertificatsAdminPage(): JSX.Element {
  const [filtre, setFiltre] = useState<StatutCertificat | null>(null);
  const [liste, setListe] = useState<CertificatAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [relance, setRelance] = useState<string | null>(null);
  // Certificat en cours de révocation (null = modale fermée).
  const [aRevoquer, setARevoquer] = useState<CertificatAdmin | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getCertificatsAdmin(filtre ?? undefined));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les certificats.');
    }
  }, [filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Rafraîchissement tant qu'un certificat est en file ou en génération.
  const enCours = (liste ?? []).some(
    (c) => c.statut === 'EN_GENERATION' || (c.statut === 'EN_ATTENTE_GENERATION' && c.nbTentatives === 0),
  );
  useEffect(() => {
    if (!enCours) return undefined;
    const minuterie = setInterval(() => void charger(), 3000);
    return () => clearInterval(minuterie);
  }, [enCours, charger]);

  const relancer = async (c: CertificatAdmin): Promise<void> => {
    setErreur(null);
    setSucces(null);
    setRelance(c.id);
    try {
      await relancerCertificat(c.id);
      setSucces(`Génération relancée pour ${nomApprenantFr(c.apprenant)}.`);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de relancer la génération.');
    } finally {
      setRelance(null);
      await charger();
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Certificats</h1>
          <p className="page-subtitle">
            Émission en arrière-plan : PDF, empreinte SHA-256 et QR code de vérification.
          </p>
        </div>
      </div>

      <div className="filtres-livrables certificats-filtres" role="group" aria-label="Filtrer les certificats">
        {FILTRES.map((f) => (
          <button
            key={f.libelle}
            type="button"
            className={`filtre-livrable${filtre === f.valeur ? ' filtre-livrable-actif' : ''}`}
            aria-pressed={filtre === f.valeur}
            onClick={() => {
              setErreur(null);
              setFiltre(f.valeur);
            }}
          >
            {f.libelle}
          </button>
        ))}
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {succes !== null && <p className="alert alert-success">{succes}</p>}

      {liste === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="page-subtitle">Aucun certificat dans cette catégorie.</p>
      ) : (
        <ul className="livrables-liste">
          {liste.map((c) => {
            const relancable = c.statut === 'EN_ATTENTE_GENERATION' || c.statut === 'EN_GENERATION';
            return (
              <li key={c.id} className="livrable-ligne certificat-ligne">
                <div className="livrable-ligne-corps">
                  <p className="livrable-ligne-nom">{nomApprenantFr(c.apprenant)}</p>
                  <p className="field-hint">
                    {c.formation.titre} · {nombreFr(c.scoreFinal)} / 100 · {c.mention} · demandé le{' '}
                    {dateHeureFr(c.dateEmission)}
                    {c.dateGeneration ? ` · émis le ${dateHeureFr(c.dateGeneration)}` : ''}
                  </p>
                  {c.empreinteSha256 && (
                    <code className="empreinte" title="SHA-256 du PDF">
                      {c.empreinteSha256}
                    </code>
                  )}
                  {c.revocation && (
                    <p className="field-hint texte-erreur">
                      Révoqué le {dateHeureFr(c.revocation.date)} ·{' '}
                      {LIBELLES_MOTIF_REVOCATION[c.revocation.motif]} — {c.revocation.description}
                    </p>
                  )}
                  {c.derniereErreur && c.statut !== 'ACTIF' && c.statut !== 'REVOQUE' && (
                    <p className="field-hint texte-erreur">
                      {c.nbTentatives} tentative{c.nbTentatives > 1 ? 's' : ''} · {c.derniereErreur}
                    </p>
                  )}
                </div>
                <div className="livrable-ligne-actions">
                  <span className={`statut-badge certificat-${c.statut}`}>
                    {LIBELLES_STATUT_CERTIFICAT[c.statut]}
                  </span>
                  {relancable && (
                    <button
                      type="button"
                      className="btn-sm btn-primary-sm"
                      onClick={() => void relancer(c)}
                      disabled={relance !== null}
                    >
                      {relance === c.id ? 'Relance…' : 'Relancer'}
                    </button>
                  )}
                  {c.statut === 'ACTIF' && (
                    <button
                      type="button"
                      className="btn-sm btn-danger"
                      onClick={() => {
                        setErreur(null);
                        setSucces(null);
                        setARevoquer(c);
                      }}
                    >
                      Révoquer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {aRevoquer && (
        <RevocationModal
          certificat={aRevoquer}
          onClose={() => setARevoquer(null)}
          onRevoque={async (c) => {
            setARevoquer(null);
            setSucces(`Certificat révoqué (${nomApprenantFr(c.apprenant)}) : le titulaire est prévenu par email.`);
            await charger();
          }}
        />
      )}
    </>
  );
}

const MOTIFS = Object.keys(LIBELLES_MOTIF_REVOCATION) as MotifRevocation[];

/**
 * Modale de révocation (DS-07) : double confirmation — case d'irréversibilité
 * et mot de passe de l'administrateur (revérifié par le serveur, 401 si faux).
 * Le bouton reste inactif tant que le formulaire n'est pas complet.
 */
function RevocationModal({
  certificat,
  onClose,
  onRevoque,
}: {
  certificat: CertificatAdmin;
  onClose: () => void;
  onRevoque: (c: CertificatAdmin) => Promise<void>;
}): JSX.Element {
  const [motif, setMotif] = useState<MotifRevocation | ''>('');
  const [description, setDescription] = useState('');
  const [irreversible, setIrreversible] = useState(false);
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const longueur = description.trim().length;
  const complet = motif !== '' && longueur >= 10 && longueur <= 2000 && irreversible && motDePasse !== '';

  const soumettre = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (motif === '' || !complet) return;
    setErreur(null);
    setEnCours(true);
    try {
      const revoque = await revoquerCertificat(certificat.id, {
        motif,
        description: description.trim(),
        confirmationIrreversible: true,
        motDePasseAdmin: motDePasse,
      });
      await onRevoque(revoque);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de révoquer le certificat.');
      setMotDePasse('');
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-revocation">
      <section className="profil-card">
        <h1 id="titre-revocation" className="auth-title">
          Révoquer le certificat
        </h1>
        <p className="auth-subtitle">
          {nomApprenantFr(certificat.apprenant)} — {certificat.formation.titre}
        </p>
        <form className="form" onSubmit={(e) => void soumettre(e)}>
          <div className="field">
            <label className="field-label" htmlFor="motif-revocation">
              Motif
            </label>
            <select
              id="motif-revocation"
              className="input"
              value={motif}
              onChange={(e) => setMotif(e.target.value as MotifRevocation | '')}
              disabled={enCours}
              required
            >
              <option value="">Choisir un motif…</option>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MOTIF_REVOCATION[m]}
                </option>
              ))}
            </select>
            <span className="field-hint">Le titulaire reçoit ce motif par email ; la page publique ne l’affiche pas.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="description-revocation">
              Description (interne)
            </label>
            <textarea
              id="description-revocation"
              className="input"
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={enCours}
              required
            />
            <span className="field-hint">
              10 à 2 000 caractères ({longueur}) — conservée pour l’audit, jamais publiée.
            </span>
          </div>
          <label className="case">
            <input
              type="checkbox"
              checked={irreversible}
              onChange={(e) => setIrreversible(e.target.checked)}
              disabled={enCours}
            />
            Je comprends que cette action est irréversible.
          </label>
          <div className="field">
            <label className="field-label" htmlFor="mdp-revocation">
              Votre mot de passe administrateur
            </label>
            <input
              id="mdp-revocation"
              className="input"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              disabled={enCours}
              required
            />
          </div>
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-sm btn-ghost" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn btn-danger-solid" disabled={!complet || enCours}>
              {enCours ? 'Révocation…' : 'Révoquer définitivement'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

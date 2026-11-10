'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import {
  AdminError,
  CertificatAdmin,
  FicheCertificat,
  getCertificatsAdmin,
  getFicheCertificat,
  MotifRevocation,
  reemettreCertificat,
  relancerCertificat,
  revoquerCertificat,
  StatutCertificat,
} from '../../../lib/api';
import {
  consultationsFr,
  dateHeureFr,
  LIBELLES_ACTION_CERTIFICAT,
  LIBELLES_MOTIF_REVOCATION,
  LIBELLES_STATUT_CERTIFICAT,
  LIBELLES_VERDICT,
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
 *
 * US-DASH-02 — Supervision : recherche (titulaire, formation, identifiant),
 * nombre de consultations publiques par certificat, et « Fiche » : empreinte,
 * consultations (valides / refusées, dernières), historique du certificat.
 */
export default function CertificatsAdminPage(): JSX.Element {
  const [filtre, setFiltre] = useState<StatutCertificat | null>(null);
  // US-CERT-02 : seulement les échecs définitifs (lien de l'email d'alerte : ?enEchec=true).
  const [enEchec, setEnEchec] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('enEchec') === 'true') setEnEchec(true);
  }, []);
  const [liste, setListe] = useState<CertificatAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [relance, setRelance] = useState<string | null>(null);
  // Certificat en cours de révocation (null = modale fermée).
  const [aRevoquer, setARevoquer] = useState<CertificatAdmin | null>(null);
  // US-DASH-02 : recherche saisie / appliquée, fiche ouverte.
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [ficheId, setFicheId] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getCertificatsAdmin(filtre ?? undefined, recherche || undefined, enEchec));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les certificats.');
    }
  }, [filtre, recherche, enEchec]);

  const rechercher = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setErreur(null);
    setRecherche(saisie.trim());
  };

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

  /** US-CERT-08 — réémission d'un certificat révoqué pour erreur (après confirmation). */
  const [aReemettre, setAReemettre] = useState<CertificatAdmin | null>(null);

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
        <button
          type="button"
          className={`filtre-livrable${enEchec ? ' filtre-livrable-actif' : ''}`}
          aria-pressed={enEchec}
          onClick={() => {
            setErreur(null);
            setEnEchec(!enEchec);
          }}
        >
          Échecs définitifs
        </button>
      </div>

      <form className="filters certificats-recherche" onSubmit={rechercher} role="search">
        <div className="field">
          <label className="field-label" htmlFor="recherche-certificat">
            Rechercher
          </label>
          <input
            id="recherche-certificat"
            className="input"
            value={saisie}
            maxLength={255}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Titulaire, email, formation ou identifiant"
          />
        </div>
        <div className="filters-actions">
          <button type="submit" className="btn-sm">
            Rechercher
          </button>
          {recherche !== '' && (
            <button
              type="button"
              className="btn-sm btn-ghost"
              onClick={() => {
                setSaisie('');
                setRecherche('');
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </form>

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
                  {(c.statut === 'ACTIF' || c.statut === 'REVOQUE') && (
                    <p className="field-hint consultations-ligne">
                      {consultationsFr(c.consultations.total)}
                      {c.consultations.derniere ? ` · dernière le ${dateHeureFr(c.consultations.derniere)}` : ''}
                    </p>
                  )}
                  {c.remplaceCertificatId && (
                    <p className="field-hint">Réémission d’un certificat révoqué pour erreur.</p>
                  )}
                  {c.remplacePar && (
                    <p className="field-hint">Réémis : un nouveau certificat le remplace.</p>
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
                  {c.echecDefinitifLe && (
                    <p className="field-hint texte-erreur">
                      Échec définitif le {dateHeureFr(c.echecDefinitifLe)} : les administrateurs ont
                      été alertés. Relancez une fois la cause corrigée.
                    </p>
                  )}
                </div>
                <div className="livrable-ligne-actions">
                  <span className={`statut-badge certificat-${c.statut}`}>
                    {LIBELLES_STATUT_CERTIFICAT[c.statut]}
                  </span>
                  <button type="button" className="btn-sm" onClick={() => setFicheId(c.id)}>
                    Fiche
                  </button>
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
                  {c.statut === 'REVOQUE' &&
                    c.revocation?.motif === 'ERREUR_ADMIN' &&
                    c.remplacePar === null && (
                      <button
                        type="button"
                        className="btn-sm btn-primary-sm"
                        onClick={() => {
                          setErreur(null);
                          setSucces(null);
                          setAReemettre(c);
                        }}
                      >
                        Réémettre
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

      {ficheId && <FicheModal certificatId={ficheId} onClose={() => setFicheId(null)} />}

      {aReemettre && (
        <ConfirmationModal
          titre="Réémettre le certificat"
          message={`Un nouveau certificat sera émis pour ${nomApprenantFr(aReemettre.apprenant)} (« ${aReemettre.formation.titre} », ${nombreFr(aReemettre.scoreFinal)} / 100). Le certificat révoqué reste conservé et sa vérification publique renverra vers le nouveau.`}
          libelleAction="Réémettre"
          onClose={() => setAReemettre(null)}
          onConfirmer={async () => {
            await reemettreCertificat(aReemettre.id);
            setAReemettre(null);
            setSucces('Nouveau certificat en cours d’émission ✅');
            await charger();
          }}
        />
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

/** Nom lisible d'un acteur d'audit (prénom nom, sinon email). */
function nomActeur(a: { email: string; prenom: string | null; nom: string | null }): string {
  return [a.prenom, a.nom].filter(Boolean).join(' ').trim() || a.email;
}

/**
 * US-DASH-02 — Fiche d'un certificat (DS-16 P3), en lecture seule :
 * identité, empreinte SHA-256, consultations publiques (valides / refusées,
 * 20 dernières avec leur verdict) et historique des actions du journal
 * d'audit visant ce certificat (demande, émission, relances, révocation…).
 */
function FicheModal({ certificatId, onClose }: { certificatId: string; onClose: () => void }): JSX.Element {
  const [fiche, setFiche] = useState<FicheCertificat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getFicheCertificat(certificatId)
      .then(setFiche)
      .catch((error: unknown) =>
        setErreur(error instanceof AdminError ? error.message : 'Impossible de charger la fiche du certificat.'),
      );
  }, [certificatId]);

  const c = fiche?.certificat;
  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-fiche">
      <section className="profil-card fiche-certificat">
        <h1 id="titre-fiche" className="auth-title">
          Fiche du certificat
        </h1>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {fiche === null && erreur === null && <p className="page-subtitle">Chargement…</p>}
        {c && fiche && (
          <>
            <p className="auth-subtitle">
              {nomApprenantFr(c.apprenant)} — {c.formation.titre}
            </p>
            <dl className="fiche-grille">
              <dt>Identifiant</dt>
              <dd>
                <code>{c.id}</code>
              </dd>
              <dt>Statut</dt>
              <dd>
                <span className={`statut-badge certificat-${c.statut}`}>{LIBELLES_STATUT_CERTIFICAT[c.statut]}</span>
              </dd>
              <dt>Titulaire</dt>
              <dd>{c.apprenant.email}</dd>
              <dt>Score</dt>
              <dd>
                {nombreFr(c.scoreFinal)} / 100 · {c.mention}
              </dd>
              <dt>Émis le</dt>
              <dd>{c.dateGeneration ? dateHeureFr(c.dateGeneration) : '—'}</dd>
              <dt>Empreinte SHA-256</dt>
              <dd>{c.empreinteSha256 ? <code className="empreinte">{c.empreinteSha256}</code> : '—'}</dd>
            </dl>

            <h2 className="fiche-titre">Consultations publiques</h2>
            <p className="field-hint">
              {consultationsFr(fiche.consultations.total)}
              {fiche.consultations.total > 0 &&
                ` — ${fiche.consultations.valides} valide${fiche.consultations.valides > 1 ? 's' : ''}, ${
                  fiche.consultations.refusees
                } refusée${fiche.consultations.refusees > 1 ? 's' : ''}`}
            </p>
            {fiche.consultationsRecentes.length > 0 && (
              <ul className="fiche-liste">
                {fiche.consultationsRecentes.map((v, i) => (
                  <li key={`${v.horodatage}-${i}`}>
                    <span>{dateHeureFr(v.horodatage)}</span>
                    <span className={`res-badge ${v.verdict === 'VALIDE' ? 'res-ok' : 'res-ko'}`}>
                      {v.verdict ? (LIBELLES_VERDICT[v.verdict] ?? v.verdict) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="fiche-titre">Historique</h2>
            {fiche.historique.length === 0 ? (
              <p className="field-hint">Aucun événement.</p>
            ) : (
              <ol className="fiche-liste fiche-historique">
                {fiche.historique.map((e, i) => (
                  <li key={`${e.horodatage}-${i}`}>
                    <span>{dateHeureFr(e.horodatage)}</span>
                    <span>
                      {LIBELLES_ACTION_CERTIFICAT[e.action] ?? e.action}
                      {e.resultat === 'Échec' && <span className="res-badge res-ko"> Échec</span>}
                      <br />
                      <span className="field-hint">{e.acteur ? nomActeur(e.acteur) : 'Système'}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </section>
    </div>
  );
}

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

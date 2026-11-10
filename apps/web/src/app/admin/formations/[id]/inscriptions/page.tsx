'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CroixFermeture } from '../../../../../components/CroixFermeture';
import {
  AdminError,
  getFormation,
  getInscriptionsFormation,
  importerInscriptions,
  inscrireApprenant,
  InscriptionAdmin,
  RapportImportInscriptions,
  reactiverInscription,
  suspendreInscription,
} from '../../../../../lib/api';
import { dateHeureFr, nomApprenantFr } from '../../../../../lib/format';

const STATUTS: Record<InscriptionAdmin['statut'], string> = {
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  SUSPENDUE: 'Suspendue',
};

const message = (e: unknown, defaut: string): string => (e instanceof AdminError ? e.message : defaut);

/**
 * US-INSC-02 — Gérer les inscriptions d'une formation (administrateur) :
 * liste filtrable, ajout par email, suspension motivée (jamais de
 * suppression), réactivation, import CSV avec rapport ligne par ligne.
 */
export default function InscriptionsFormationPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [titre, setTitre] = useState<string | null>(null);
  const [capacite, setCapacite] = useState<number | null>(null);
  const [inscriptions, setInscriptions] = useState<InscriptionAdmin[] | null>(null);
  const [filtre, setFiltre] = useState<InscriptionAdmin['statut'] | ''>('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [aSuspendre, setASuspendre] = useState<InscriptionAdmin | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [rapport, setRapport] = useState<RapportImportInscriptions | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setInscriptions(await getInscriptionsFormation(id, filtre === '' ? undefined : filtre));
    } catch (e: unknown) {
      setErreur(message(e, 'Impossible de charger les inscriptions.'));
    }
  }, [id, filtre]);

  useEffect(() => {
    getFormation(id)
      .then((f) => {
        setTitre(f.titre);
        setCapacite(f.capaciteMax);
      })
      .catch((e: unknown) => setErreur(message(e, 'Formation introuvable.')));
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const agir = async (action: () => Promise<unknown>, ok: string): Promise<void> => {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    try {
      await action();
      setSucces(ok);
      await charger();
    } catch (e: unknown) {
      setErreur(message(e, 'Action impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const ajouter = (e: FormEvent): void => {
    e.preventDefault();
    void agir(async () => {
      await inscrireApprenant(id, email);
      setEmail('');
    }, 'Apprenant inscrit : un email de bienvenue lui a été envoyé.');
  };

  const importer = (e: FormEvent): void => {
    e.preventDefault();
    if (!fichier) return;
    setRapport(null);
    void agir(async () => setRapport(await importerInscriptions(id, fichier)), 'Import terminé.');
  };

  const actives = (inscriptions ?? []).filter((i) => i.statut !== 'SUSPENDUE').length;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/admin/formations">
          ← Formations
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1 className="page-title">Inscriptions</h1>
          <p className="page-subtitle">
            {titre ?? 'Chargement…'}
            {capacite !== null && filtre === '' && inscriptions !== null
              ? ` — ${actives} / ${capacite} places occupées`
              : ''}
          </p>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {succes !== null && <p className="alert alert-success">{succes}</p>}

      <div className="inscr-outils">
        <form className="tdb-bloc inscr-form" onSubmit={ajouter}>
          <h2>Inscrire un apprenant</h2>
          <label className="field">
            <span className="field-label">Email du compte apprenant</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@esprit.tn"
            />
          </label>
          <button type="submit" className="btn" disabled={enCours || email.trim() === ''}>
            Inscrire
          </button>
        </form>
        <form className="tdb-bloc inscr-form" onSubmit={importer}>
          <h2>Importer un CSV</h2>
          <label className="field">
            <span className="field-label">Fichier (une adresse email par ligne)</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className="field-hint">En-tête « email » facultatif ; 64 Ko et 500 lignes au plus.</span>
          <button type="submit" className="btn" disabled={enCours || fichier === null}>
            Importer
          </button>
        </form>
      </div>

      {rapport !== null && (
        <section className="tdb-bloc" aria-label="Rapport d’import">
          <h2>
            Rapport d’import — {rapport.bilan.INSCRIT ?? 0} inscrit(s) sur {rapport.total} ligne(s)
          </h2>
          <ul className="inscr-rapport">
            {rapport.lignes.map((l) => (
              <li key={l.ligne} className={l.resultat === 'INSCRIT' ? 'inscr-ok' : 'inscr-ko'}>
                <span className="inscr-ligne">Ligne {l.ligne}</span>
                <span className="inscr-email">{l.email}</span>
                <span>{l.libelle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tdb-bloc" aria-label="Liste des inscriptions">
        <div className="inscr-entete">
          <h2>Inscrits</h2>
          <select
            className="input inscr-filtre"
            aria-label="Filtrer par statut"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value as InscriptionAdmin['statut'] | '')}
          >
            <option value="">Tous les statuts</option>
            <option value="EN_COURS">En cours</option>
            <option value="SUSPENDUE">Suspendues</option>
            <option value="TERMINEE">Terminées</option>
          </select>
        </div>
        {inscriptions === null ? (
          <p className="page-subtitle">Chargement…</p>
        ) : inscriptions.length === 0 ? (
          <p className="page-subtitle">Aucune inscription.</p>
        ) : (
          <ul className="inscr-liste">
            {inscriptions.map((i) => (
              <li key={i.id} className="inscr-item">
                <div className="inscr-infos">
                  <strong>{nomApprenantFr(i.apprenant)}</strong>
                  <span className="inscr-email">{i.apprenant.email}</span>
                  <span className="field-hint">
                    Inscrit le {dateHeureFr(i.dateInscription)} · avancement {Math.round(i.tauxAvancement)} %
                  </span>
                  {i.statut === 'SUSPENDUE' && i.motifSuspension && (
                    <span className="inscr-motif">
                      Suspendue{i.dateSuspension ? ` le ${dateHeureFr(i.dateSuspension)}` : ''} :{' '}
                      {i.motifSuspension}
                    </span>
                  )}
                </div>
                <span className={`statut-badge inscr-${i.statut}`}>{STATUTS[i.statut]}</span>
                {i.statut === 'EN_COURS' && (
                  <button className="btn-sm" disabled={enCours} onClick={() => setASuspendre(i)}>
                    Suspendre
                  </button>
                )}
                {i.statut === 'SUSPENDUE' && (
                  <button
                    className="btn-sm"
                    disabled={enCours}
                    onClick={() =>
                      void agir(() => reactiverInscription(i.id), 'Inscription réactivée.')
                    }
                  >
                    Réactiver
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {aSuspendre !== null && (
        <SuspendreModal
          inscription={aSuspendre}
          onClose={() => setASuspendre(null)}
          onConfirm={(motif) => {
            const cible = aSuspendre;
            setASuspendre(null);
            void agir(
              () => suspendreInscription(cible.id, motif),
              'Inscription suspendue : l’apprenant a été prévenu par email.',
            );
          }}
        />
      )}
    </>
  );
}

function SuspendreModal({
  inscription,
  onClose,
  onConfirm,
}: {
  inscription: InscriptionAdmin;
  onClose: () => void;
  onConfirm: (motif: string) => void;
}): JSX.Element {
  const [motif, setMotif] = useState('');
  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <form
        className="profil-card modal-closable"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(motif.trim());
        }}
      >
        <CroixFermeture onClose={onClose} disabled={false} />
        <h1 className="auth-title">Suspendre l’inscription</h1>
        <p className="auth-subtitle">
          {nomApprenantFr(inscription.apprenant)} perdra l’accès à la formation jusqu’à sa
          réactivation. Rien n’est supprimé.
        </p>
        <label className="field">
          <span className="field-label">Motif (obligatoire, communiqué à l’apprenant)</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            required
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-danger-solid" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn" disabled={motif.trim() === ''}>
            Suspendre
          </button>
        </div>
      </form>
    </div>
  );
}

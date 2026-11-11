'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CroixFermeture } from '../../../components/CroixFermeture';
import {
  accepterDemandeAffectation,
  AdminError,
  DemandeAffectationAdmin,
  getAdminDemandesAffectation,
  refuserDemandeAffectation,
  StatutDemandeAffectation,
} from '../../../lib/api';
import { dateHeureFr, LIBELLES_STATUT_DEMANDE_FORMATEUR } from '../../../lib/format';

const FILTRES: StatutDemandeAffectation[] = ['EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE'];
const MOTIF_MIN = 10;
const MOTIF_MAX = 1000;

const nomDe = (f: DemandeAffectationAdmin['formateur']): string =>
  [f.prenom, f.nom].filter(Boolean).join(' ') || f.email;

/**
 * US-FORM-07 — Demandes d'affectation des formateurs (ADMINISTRATEUR) :
 * accepter (l'affectation est créée par l'API dans la même transaction) ou
 * refuser avec un motif. Même présentation que les demandes de rôle.
 */
export default function AdminDemandesAffectationPage(): JSX.Element {
  const [filtre, setFiltre] = useState<StatutDemandeAffectation>('EN_ATTENTE');
  const [demandes, setDemandes] = useState<DemandeAffectationAdmin[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [aRefuser, setARefuser] = useState<DemandeAffectationAdmin | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setDemandes((await getAdminDemandesAffectation({ statut: filtre, limit: 100 })).items);
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les demandes.');
    } finally {
      setChargement(false);
    }
  }, [filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function accepter(d: DemandeAffectationAdmin): Promise<void> {
    setEnCours(d.id);
    setErreur(null);
    setSucces(null);
    try {
      await accepterDemandeAffectation(d.id);
      setSucces(`${nomDe(d.formateur)} est désormais affecté à « ${d.formation.titre} ».`);
      await charger();
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible d’accepter la demande.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Demandes d’affectation</h1>
          <p className="page-subtitle">
            Des formateurs demandent à enseigner une formation existante. Accepter les affecte
            immédiatement ; un refus exige un motif, envoyé au formateur.
          </p>
        </div>
        <div className="row-actions">
          <select
            className="input"
            aria-label="Filtrer par statut"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value as StatutDemandeAffectation)}
            disabled={chargement}
          >
            {FILTRES.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT_DEMANDE_FORMATEUR[s]}
              </option>
            ))}
          </select>
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
        </div>
      </div>

      {succes && <p className="alert alert-success">{succes}</p>}
      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Formateur</th>
                <th>Formation</th>
                <th>Motif</th>
                <th>Envoyée le</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div>{nomDe(d.formateur)}</div>
                    <div className="muted-cell">{d.formateur.email}</div>
                  </td>
                  <td>
                    <Link className="table-link" href={`/admin/formations/${d.formation.id}/inscriptions`}>
                      {d.formation.titre}
                    </Link>
                  </td>
                  <td className="demande-motif">{d.motif}</td>
                  <td>{dateHeureFr(d.creeLe)}</td>
                  <td>
                    <span className={`statut-badge statut-${d.statut}`}>
                      {LIBELLES_STATUT_DEMANDE_FORMATEUR[d.statut]}
                    </span>
                    {d.statut === 'REFUSEE' && d.motifRefus && (
                      <div className="field-hint demande-motif">Motif : {d.motifRefus}</div>
                    )}
                  </td>
                  <td>
                    {d.statut === 'EN_ATTENTE' ? (
                      <div className="row-actions">
                        <button className="btn-sm" disabled={enCours === d.id} onClick={() => void accepter(d)}>
                          {enCours === d.id ? 'Affectation…' : 'Accepter'}
                        </button>
                        <button
                          className="btn-sm btn-danger"
                          disabled={enCours === d.id}
                          onClick={() => {
                            setErreur(null);
                            setSucces(null);
                            setARefuser(d);
                          }}
                        >
                          Refuser
                        </button>
                      </div>
                    ) : (
                      <span className="muted-cell">{d.traiteLe ? dateHeureFr(d.traiteLe) : 'Traitée'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {demandes.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted-cell">
                    Aucune demande « {LIBELLES_STATUT_DEMANDE_FORMATEUR[filtre].toLowerCase()} ».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aRefuser && (
        <RefusModal
          demande={aRefuser}
          onClose={() => setARefuser(null)}
          onDone={(message) => {
            setARefuser(null);
            setSucces(message);
            void charger();
          }}
        />
      )}
    </>
  );
}

function RefusModal({
  demande,
  onClose,
  onDone,
}: {
  demande: DemandeAffectationAdmin;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const longueur = motif.trim().length;

  async function valider(e: FormEvent): Promise<void> {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await refuserDemandeAffectation(demande.id, motif.trim());
      onDone(`Demande de ${nomDe(demande.formateur)} refusée.`);
    } catch (err) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible de refuser la demande.');
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-refus">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title" id="titre-refus">
          Refuser la demande
        </h2>
        <p className="auth-subtitle">
          {nomDe(demande.formateur)} — « {demande.formation.titre} »
        </p>
        <form className="form" onSubmit={(e) => void valider(e)}>
          <label className="field">
            <span className="field-label">Motif du refus</span>
            <textarea
              className="input"
              rows={4}
              maxLength={MOTIF_MAX}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              disabled={enCours}
              required
            />
            <span className="field-hint">
              Obligatoire ({MOTIF_MIN} à {MOTIF_MAX} caractères) : envoyé au formateur par email.
            </span>
          </label>
          {erreur && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-danger-solid" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={enCours || longueur < MOTIF_MIN || longueur > MOTIF_MAX}>
              {enCours ? 'Refus…' : 'Refuser'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

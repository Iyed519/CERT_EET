'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import {
  AdminError,
  annulerDemandeAffectation,
  creerDemandeAffectation,
  DemandeAffectation,
  FormationDisponible,
  getFormationsDisponibles,
  getMesDemandesAffectation,
} from '../../../lib/api';
import { jourFr, LIBELLES_STATUT_DEMANDE_FORMATEUR, periodeFr } from '../../../lib/format';

const MOTIF_MIN = 10;
const MOTIF_MAX = 1000;

/**
 * US-FORM-07 — Mes demandes : demander à enseigner une formation existante
 * (non archivée, où je ne suis pas affecté), suivre mes demandes, annuler une
 * demande en attente. Possible même si j'enseigne déjà d'autres formations.
 * La sécurité réelle est côté API (rôle formateur, unicité, verrous).
 */
export default function MesDemandesPage(): JSX.Element {
  const [demandes, setDemandes] = useState<DemandeAffectation[]>([]);
  const [disponibles, setDisponibles] = useState<FormationDisponible[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [formationId, setFormationId] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [aAnnuler, setAAnnuler] = useState<DemandeAffectation | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const [d, f] = await Promise.all([getMesDemandesAffectation(), getFormationsDisponibles()]);
      setDemandes(d);
      setDisponibles(f);
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger vos demandes.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const longueur = motif.trim().length;
  const choix = disponibles.filter((f) => !f.demandeEnAttente);
  const pret = formationId !== '' && longueur >= MOTIF_MIN && longueur <= MOTIF_MAX;

  async function envoyer(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!pret) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    try {
      const d = await creerDemandeAffectation(formationId, motif.trim());
      setSucces(`Demande envoyée pour « ${d.formation.titre} ». Un administrateur va l’examiner.`);
      setFormationId('');
      setMotif('');
      await charger();
    } catch (err) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible d’envoyer la demande.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes demandes</h1>
          <p className="page-subtitle">
            Demandez à enseigner une formation existante. Un administrateur accepte ou refuse ;
            vous êtes prévenu par email.
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn-sm btn-link" href="/formateur/tableau-de-bord">
            Tableau de bord
          </Link>
        </div>
      </div>

      {succes && <p className="alert alert-success">{succes}</p>}
      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}

      <section className="tdb-bloc" aria-labelledby="titre-demander">
        <h2 id="titre-demander">Demander une formation</h2>
        {chargement ? (
          <p className="kpi-sous">Chargement…</p>
        ) : choix.length === 0 ? (
          <p className="kpi-sous">
            Aucune formation disponible : vous enseignez déjà toutes les formations ouvertes ou
            avez déjà une demande en attente pour chacune.
          </p>
        ) : (
          <form className="demande-form" onSubmit={(e) => void envoyer(e)}>
            <label className="field">
              <span className="field-label">Formation</span>
              <select
                className="input"
                value={formationId}
                onChange={(e) => setFormationId(e.target.value)}
                disabled={envoi}
                required
              >
                <option value="">Choisir une formation…</option>
                {choix.map((f) => {
                  const periode = periodeFr(f.dateDebut, f.dateFin);
                  return (
                    <option key={f.id} value={f.id}>
                      {f.titre}
                      {periode ? ` (${periode})` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Motif</span>
              <textarea
                className="input"
                rows={4}
                maxLength={MOTIF_MAX}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                disabled={envoi}
                placeholder="Votre expérience sur ce sujet, les modules que vous pouvez prendre en charge…"
                required
              />
              <span className="compteur-caracteres">
                {longueur} / {MOTIF_MAX} (au moins {MOTIF_MIN})
              </span>
            </label>
            <div>
              <button className="btn" type="submit" disabled={!pret || envoi}>
                {envoi ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="tdb-bloc" aria-labelledby="titre-mes-demandes">
        <h2 id="titre-mes-demandes">Mes demandes d’affectation</h2>
        {!chargement && demandes.length === 0 ? (
          <p className="kpi-sous">Vous n’avez encore envoyé aucune demande.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th>Statut</th>
                  <th>Motif</th>
                  <th>Envoyée le</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {demandes.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.statut === 'ACCEPTEE' ? (
                        <Link className="table-link" href={`/formateur/formations/${d.formation.id}`}>
                          {d.formation.titre}
                        </Link>
                      ) : (
                        d.formation.titre
                      )}
                    </td>
                    <td>
                      <span className={`statut-badge statut-${d.statut}`}>
                        {LIBELLES_STATUT_DEMANDE_FORMATEUR[d.statut]}
                      </span>
                      {d.statut === 'REFUSEE' && d.motifRefus && (
                        <div className="field-hint demande-motif">Motif : {d.motifRefus}</div>
                      )}
                    </td>
                    <td className="demande-motif">{d.motif}</td>
                    <td>{jourFr(d.creeLe)}</td>
                    <td>
                      {d.statut === 'EN_ATTENTE' ? (
                        <button className="btn-sm btn-danger" onClick={() => setAAnnuler(d)}>
                          Annuler
                        </button>
                      ) : (
                        <span className="muted-cell">{d.traiteLe ? jourFr(d.traiteLe) : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aAnnuler && (
        <ConfirmationModal
          titre="Annuler la demande"
          message={`Annuler votre demande pour « ${aAnnuler.formation.titre} » ? Vous pourrez en envoyer une nouvelle.`}
          libelleAction="Annuler la demande"
          onClose={() => setAAnnuler(null)}
          onConfirmer={async () => {
            await annulerDemandeAffectation(aAnnuler.id);
            setAAnnuler(null);
            setSucces('Demande annulée.');
            await charger();
          }}
        />
      )}
    </div>
  );
}

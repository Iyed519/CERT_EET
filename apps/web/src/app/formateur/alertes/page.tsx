'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminError, AlerteDecrochage, getAlertes, StatutAlerte } from '../../../lib/api';
import {
  dateHeureFr,
  faitsAlerteFr,
  LIBELLES_CRITERE_ALERTE,
  nomApprenantFr,
} from '../../../lib/format';

const STATUTS: Array<[StatutAlerte | '', string]> = [
  ['OUVERTE', 'Ouvertes'],
  ['TRAITEE', 'Traitées'],
  ['', 'Toutes'],
];

/**
 * US-SUIVI-02 — Alertes de décrochage du formateur (DS-14 P2).
 *
 * Alertes créées par le balayage planifié sur les formations où le formateur
 * est affecté (l'API filtre ; l'administrateur les voit toutes) : apprenant,
 * formation, critère, faits, suggestion d'action, lien vers le suivi.
 */
export default function AlertesPage(): JSX.Element {
  const [statut, setStatut] = useState<StatutAlerte | ''>('OUVERTE');
  const [alertes, setAlertes] = useState<AlerteDecrochage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setAlertes(null);
    getAlertes(statut ? { statut } : {})
      .then(setAlertes)
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les alertes.'),
      );
  }, [statut]);

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/formateur/formations">
          ← Mes formations
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1 className="page-title">Alertes de décrochage</h1>
          <p className="page-subtitle">
            Créées automatiquement sur des faits : inactivité de plus de 7 jours, deux échecs de QCM
            consécutifs, livrable non rendu 48 h après la date limite, note en forte baisse.
          </p>
        </div>
      </div>

      <div className="filtres-livrables" role="group" aria-label="Statut">
        {STATUTS.map(([v, l]) => (
          <button
            key={l}
            type="button"
            className={`filtre-livrable${statut === v ? ' filtre-livrable-actif' : ''}`}
            onClick={() => setStatut(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {alertes === null && erreur === null && <p className="page-subtitle">Chargement…</p>}
      {alertes !== null && alertes.length === 0 && (
        <p className="alert alert-success">Aucune alerte {statut === 'OUVERTE' ? 'ouverte' : ''}.</p>
      )}

      <ul className="alertes-liste">
        {(alertes ?? []).map((a) => (
          <li key={a.id} className={`alerte-carte alerte-${a.statut}`}>
            <div className="alerte-tete">
              <span className="badge-risque">{LIBELLES_CRITERE_ALERTE[a.critere] ?? a.critere}</span>
              <span className="alerte-date">{dateHeureFr(a.dateCreation)}</span>
            </div>
            <p className="alerte-qui">
              <strong>{nomApprenantFr(a.apprenant)}</strong> ·{' '}
              <Link href={`/formateur/formations/${a.formation.id}/suivi`}>{a.formation.titre}</Link>
            </p>
            <p className="alerte-faits">{faitsAlerteFr(a.critere, a.donnees)}</p>
            <p className="alerte-suggestion">Suggestion : {a.suggestion}</p>
            {a.statut === 'TRAITEE' && a.dateTraitement && (
              <p className="kpi-sous">Traitée le {dateHeureFr(a.dateTraitement)}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

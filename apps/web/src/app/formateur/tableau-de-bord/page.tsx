'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { getTableauDeBordFormateur, TableauDeBordFormateur } from '../../../lib/api';
import {
  jourFr,
  LIBELLES_STATUT_FORMATION_COURT,
  LIBELLES_STATUT_FORMATION_UN,
  nombreFr,
} from '../../../lib/format';

/** Raccourcis de période (jours, aujourd'hui compris) — comme US-DASH-01. */
const RACCOURCIS = [7, 30, 90, 365];

/** Date locale du navigateur au format AAAA-MM-JJ (champ <input type="date">). */
function jourLocal(decalage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toLocaleDateString('sv-SE');
}

const pourcent = (n: number): string => `${nombreFr(n)} %`;
const sur100 = (n: number | null): string => (n === null ? '—' : `${nombreFr(n)} / 100`);

/**
 * US-DASH-03 — Tableau de bord global du formateur : toutes ses formations
 * (affectations), sur une période de jours inclus (30 derniers par défaut).
 * Les chiffres « sur la période » portent sur les jours choisis (heure de
 * Tunis) ; les autres sont l'état actuel. Lecture seule ; la sécurité réelle
 * est côté API (403 pour un autre rôle, périmètre limité à ses formations).
 */
export default function TableauDeBordFormateurPage(): JSX.Element {
  const [periode, setPeriode] = useState<{ du?: string; au?: string }>({});
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState<TableauDeBordFormateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const t = await getTableauDeBordFormateur(periode);
      setDonnees(t);
      setDu(t.periode.du);
      setAu(t.periode.au);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de charger le tableau de bord.');
    } finally {
      setChargement(false);
    }
  }, [periode]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const appliquer = (e: FormEvent): void => {
    e.preventDefault();
    setPeriode({ du: du || undefined, au: au || undefined });
  };

  const t = donnees;
  const maxActivite = t ? Math.max(1, ...t.activite.map((j) => j.tentatives + j.livrables)) : 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">
            Toutes vos formations. Les indicateurs « sur la période » portent sur les jours
            choisis (heure de Tunis) ; les autres sont l’état actuel.
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn-sm btn-link" href="/formateur/formations">
            Mes formations
          </Link>
        </div>
      </div>

      <form className="filters tdb-periode" onSubmit={appliquer}>
        <label className="field">
          <span className="field-label">Du</span>
          <input className="input" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Au</span>
          <input className="input" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
        </label>
        <div className="filters-actions">
          <button className="btn btn-primary-sm" type="submit">
            Appliquer
          </button>
          {RACCOURCIS.map((j) => (
            <button
              key={j}
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => setPeriode({ du: jourLocal(-(j - 1)), au: jourLocal() })}
            >
              {j === 365 ? '1 an' : `${j} j`}
            </button>
          ))}
        </div>
      </form>

      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}
      {chargement && !t && <p className="page-subtitle">Chargement…</p>}

      {t && (
        <>
          <p className="tdb-sous-titre">
            Du {jourFr(t.periode.du)} au {jourFr(t.periode.au)} · {t.periode.jours} jour
            {t.periode.jours > 1 ? 's' : ''}
          </p>

          <section className="tdb-grille" aria-label="Indicateurs">
            <article className="kpi">
              <h2>Formations</h2>
              <p className="kpi-valeur">{nombreFr(t.formations.total)}</p>
              <p className="kpi-sous">où vous êtes affecté</p>
              <ul className="kpi-repartition">
                {Object.entries(t.formations.parStatut).map(([statut, n]) => (
                  <li key={statut}>
                    <span>{LIBELLES_STATUT_FORMATION_COURT[statut] ?? statut}</span>
                    <strong>{nombreFr(n)}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="kpi">
              <h2>Apprenants</h2>
              <p className="kpi-valeur">{nombreFr(t.apprenants.inscrits)}</p>
              <p className="kpi-sous">inscrits · {nombreFr(t.apprenants.nouveaux)} sur la période</p>
              <ul className="kpi-repartition">
                <li>
                  <span>Actifs (en cours)</span>
                  <strong>{nombreFr(t.apprenants.actifs)}</strong>
                </li>
              </ul>
            </article>

            <article className="kpi">
              <h2>QCM</h2>
              <p className="kpi-valeur">{pourcent(t.qcm.tauxReussite)}</p>
              <p className="kpi-sous">
                de réussite · {nombreFr(t.qcm.tentativesNotees)} tentatives notées sur la période
              </p>
              <ul className="kpi-repartition">
                <li>
                  <span>Score moyen</span>
                  <strong>{sur100(t.qcm.scoreMoyen)}</strong>
                </li>
                <li>
                  <span>Tentatives à évaluer</span>
                  <strong>{nombreFr(t.qcm.aEvaluer)}</strong>
                </li>
              </ul>
            </article>

            <article className="kpi">
              <h2>À évaluer</h2>
              <p className="kpi-valeur">{nombreFr(t.ateliers.livrablesAEvaluer)}</p>
              <p className="kpi-sous">livrables d’atelier à corriger ou en correction</p>
            </article>

            <article className="kpi">
              <h2>Alertes de décrochage</h2>
              <p className="kpi-valeur">{nombreFr(t.alertesOuvertes)}</p>
              <p className="kpi-sous">ouvertes</p>
              <p>
                <Link href="/formateur/alertes">Voir les alertes</Link>
              </p>
            </article>

            <article className="kpi">
              <h2>Certificats</h2>
              <p className="kpi-valeur">{nombreFr(t.certificatsDelivres)}</p>
              <p className="kpi-sous">délivrés sur la période</p>
            </article>
          </section>

          <section className="tdb-bloc" aria-label="Activité quotidienne">
            <h2>Activité quotidienne</h2>
            <p className="kpi-sous">
              Évaluations par jour : tentatives de QCM notées (en foncé) et livrables déposés.
            </p>
            <div className="tdb-graphe" role="img" aria-label="Évaluations par jour">
              {t.activite.map((j) => {
                const total = j.tentatives + j.livrables;
                return (
                  <div
                    key={j.jour}
                    className="tdb-barre"
                    title={`${jourFr(j.jour)} : ${j.tentatives} tentative(s) notée(s), ${j.livrables} livrable(s)`}
                  >
                    <span className="tdb-barre-total" style={{ height: `${(total / maxActivite) * 100}%` }}>
                      <span
                        className="tdb-barre-connexions"
                        style={{ height: total ? `${(j.tentatives / total) * 100}%` : 0 }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="tdb-axe">
              <span>{jourFr(t.periode.du)}</span>
              <span>{jourFr(t.periode.au)}</span>
            </p>
          </section>

          <section className="tdb-bloc" aria-label="Mes formations">
            <h2>Mes formations</h2>
            {t.mesFormations.length === 0 ? (
              <p className="kpi-sous">
                Vous n’êtes affecté à aucune formation pour l’instant.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Formation</th>
                      <th>Statut</th>
                      <th>Inscrits / actifs</th>
                      <th>Réussite QCM</th>
                      <th>Score moyen</th>
                      <th>À évaluer</th>
                      <th>Alertes</th>
                      <th>Certificats</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {t.mesFormations.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link className="table-link" href={`/formateur/formations/${f.id}`}>
                            {f.titre}
                          </Link>
                        </td>
                        <td>
                          <span className={`statut-badge statut-${f.statut}`}>
                            {LIBELLES_STATUT_FORMATION_UN[f.statut] ?? f.statut}
                          </span>
                        </td>
                        <td>
                          {nombreFr(f.inscrits)} / {nombreFr(f.actifs)}
                        </td>
                        <td>
                          {f.tentativesNotees === 0 ? (
                            <span className="muted-cell">—</span>
                          ) : (
                            pourcent(f.tauxReussite)
                          )}
                        </td>
                        <td>{sur100(f.scoreMoyen)}</td>
                        <td>
                          {nombreFr(f.tentativesAEvaluer + f.livrablesAEvaluer)}
                          <div className="muted-cell">
                            {nombreFr(f.tentativesAEvaluer)} QCM · {nombreFr(f.livrablesAEvaluer)} livrables
                          </div>
                        </td>
                        <td>{nombreFr(f.alertesOuvertes)}</td>
                        <td>{nombreFr(f.certificatsDelivres)}</td>
                        <td>
                          <Link className="btn-sm btn-link" href={`/formateur/formations/${f.id}/suivi`}>
                            Suivi
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

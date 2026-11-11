'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { getTableauDeBordGlobal, TableauDeBordGlobal } from '../../../lib/api';
import {
  dateHeureFr,
  jourFr,
  LIBELLES_ALERTE_SYSTEME,
  LIBELLES_ROLE,
  LIBELLES_STATUT_CERTIFICAT,
  LIBELLES_STATUT_FORMATION_COURT,
  LIBELLES_STATUT_INSCRIPTION_COURT,
  nombreFr,
} from '../../../lib/format';

/** Raccourcis de période (jours, aujourd'hui compris). */
const RACCOURCIS = [7, 30, 90, 365];

/** Date locale du navigateur au format AAAA-MM-JJ (champ <input type="date">). */
function jourLocal(decalage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toLocaleDateString('sv-SE');
}

/** « Prénom Nom », l'email à défaut, « Système / visiteur » sans acteur. */
function acteurFr(a: TableauDeBordGlobal['activiteRecente'][number]['acteur']): string {
  if (!a) return 'Système / visiteur';
  return [a.prenom, a.nom].filter(Boolean).join(' ') || a.email;
}

function Repartition({
  valeurs,
  libelles,
}: {
  valeurs: Record<string, number>;
  libelles: Record<string, string>;
}): JSX.Element {
  return (
    <ul className="kpi-repartition">
      {Object.entries(valeurs).map(([cle, n]) => (
        <li key={cle}>
          <span>{libelles[cle] ?? cle}</span>
          <strong>{nombreFr(n)}</strong>
        </li>
      ))}
    </ul>
  );
}

/**
 * US-DASH-01 — Tableau de bord global (ADMINISTRATEUR, DS-16 P2).
 *
 * Indicateurs agrégés par l'API (une requête SQL par bloc) sur une période
 * de jours inclus (30 derniers jours par défaut) : utilisateurs, formations,
 * inscriptions, évaluations, certificats, activité quotidienne, activité
 * récente et alertes système. Lecture seule ; la sécurité réelle est côté API
 * (403 pour un autre rôle).
 */
export default function TableauDeBordPage(): JSX.Element {
  const [periode, setPeriode] = useState<{ du?: string; au?: string }>({});
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState<TableauDeBordGlobal | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const t = await getTableauDeBordGlobal(periode);
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

  const raccourci = (jours: number): void => {
    setPeriode({ du: jourLocal(-(jours - 1)), au: jourLocal() });
  };

  const t = donnees;
  const maxActivite = t ? Math.max(1, ...t.activite.map((j) => j.evenements)) : 1;

  return (
    <main className="page">
      <h1>Tableau de bord</h1>
      <p className="page-intro">
        Activité de toute la plateforme. Les indicateurs « sur la période » portent sur les jours
        choisis (heure de Tunis) ; les autres sont l’état actuel.
      </p>

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
            <button key={j} className="btn btn-sm btn-ghost" type="button" onClick={() => raccourci(j)}>
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
      {chargement && !t && <p>Chargement…</p>}

      {t && (
        <>
          <p className="tdb-sous-titre">
            Du {jourFr(t.periode.du)} au {jourFr(t.periode.au)} · {t.periode.jours} jour
            {t.periode.jours > 1 ? 's' : ''}
          </p>

          {t.alertes.length > 0 ? (
            <section className="tdb-alertes" aria-label="Alertes système">
              {t.alertes.map((a) => {
                const [libelle, lien] = LIBELLES_ALERTE_SYSTEME[a.code] ?? [a.code, ''];
                return (
                  <p key={a.code} className="alert alert-info">
                    <strong>{nombreFr(a.nombre)}</strong> {libelle}
                    {lien && (
                      <>
                        {' · '}
                        <Link href={lien}>Voir</Link>
                      </>
                    )}
                  </p>
                );
              })}
            </section>
          ) : (
            <p className="alert alert-success">Aucune alerte système.</p>
          )}

          <section className="tdb-grille" aria-label="Indicateurs">
            <article className="kpi">
              <h2>Utilisateurs</h2>
              <p className="kpi-valeur">{nombreFr(t.utilisateurs.total)}</p>
              <p className="kpi-sous">
                {nombreFr(t.utilisateurs.nouveaux)} nouveaux · {nombreFr(t.utilisateurs.connectes)}{' '}
                connectés sur la période
              </p>
              <Repartition valeurs={t.utilisateurs.parRole} libelles={LIBELLES_ROLE} />
            </article>

            <article className="kpi">
              <h2>Formations</h2>
              <p className="kpi-valeur">{nombreFr(t.formations.total)}</p>
              <p className="kpi-sous">{nombreFr(t.formations.nouvelles)} créées sur la période</p>
              <Repartition valeurs={t.formations.parStatut} libelles={LIBELLES_STATUT_FORMATION_COURT} />
            </article>

            <article className="kpi">
              <h2>Inscriptions</h2>
              <p className="kpi-valeur">{nombreFr(t.inscriptions.total)}</p>
              <p className="kpi-sous">{nombreFr(t.inscriptions.nouvelles)} sur la période</p>
              <Repartition
                valeurs={t.inscriptions.parStatut}
                libelles={LIBELLES_STATUT_INSCRIPTION_COURT}
              />
            </article>

            <article className="kpi">
              <h2>QCM</h2>
              <p className="kpi-valeur">{nombreFr(t.evaluations.qcm.tentativesNotees)}</p>
              <p className="kpi-sous">tentatives notées sur la période</p>
              <ul className="kpi-repartition">
                <li>
                  <span>Taux de réussite</span>
                  <strong>{nombreFr(t.evaluations.qcm.tauxReussite)} %</strong>
                </li>
                <li>
                  <span>Score moyen</span>
                  <strong>
                    {t.evaluations.qcm.scoreMoyen === null
                      ? '—'
                      : `${nombreFr(t.evaluations.qcm.scoreMoyen)} / 100`}
                  </strong>
                </li>
                <li>
                  <span>En cours maintenant</span>
                  <strong>{nombreFr(t.evaluations.qcm.enCours)}</strong>
                </li>
              </ul>
            </article>

            <article className="kpi">
              <h2>Ateliers</h2>
              <p className="kpi-valeur">{nombreFr(t.evaluations.ateliers.livrablesSoumis)}</p>
              <p className="kpi-sous">livrables déposés sur la période</p>
              <ul className="kpi-repartition">
                <li>
                  <span>Corrections finalisées</span>
                  <strong>{nombreFr(t.evaluations.ateliers.correctionsFinalisees)}</strong>
                </li>
                <li>
                  <span>Note moyenne</span>
                  <strong>
                    {t.evaluations.ateliers.noteMoyenne === null
                      ? '—'
                      : `${nombreFr(t.evaluations.ateliers.noteMoyenne)} / 100`}
                  </strong>
                </li>
                <li>
                  <span>À corriger / en correction</span>
                  <strong>
                    {nombreFr(t.evaluations.ateliers.enAttenteCorrection)} /{' '}
                    {nombreFr(t.evaluations.ateliers.enCorrection)}
                  </strong>
                </li>
              </ul>
            </article>

            <article className="kpi">
              <h2>Demandes en attente</h2>
              <p className="kpi-valeur">{nombreFr(t.demandesEnAttente.role)}</p>
              <p className="kpi-sous">attendent votre décision</p>
              <ul className="kpi-repartition">
                <li>
                  <Link href="/admin/role-requests">Demandes de rôle</Link>
                  <strong>{nombreFr(t.demandesEnAttente.role)}</strong>
                </li>
              </ul>
            </article>

            <article className="kpi">
              <h2>Certificats</h2>
              <p className="kpi-valeur">{nombreFr(t.certificats.emis)}</p>
              <p className="kpi-sous">
                émis · {nombreFr(t.certificats.revoques)} révoqués ·{' '}
                {nombreFr(t.certificats.consultations)} consultations publiques sur la période
              </p>
              <Repartition valeurs={t.certificats.parStatut} libelles={LIBELLES_STATUT_CERTIFICAT} />
            </article>
          </section>

          <section className="tdb-bloc" aria-label="Activité quotidienne">
            <h2>Activité quotidienne</h2>
            <p className="kpi-sous">
              Événements du journal d’audit par jour (dont connexions réussies en foncé).
            </p>
            <div className="tdb-graphe" role="img" aria-label="Événements par jour">
              {t.activite.map((j) => (
                <div
                  key={j.jour}
                  className="tdb-barre"
                  title={`${jourFr(j.jour)} : ${j.evenements} événement(s), ${j.connexions} connexion(s), ${j.echecs} échec(s)`}
                >
                  <span
                    className="tdb-barre-total"
                    style={{ height: `${(j.evenements / maxActivite) * 100}%` }}
                  >
                    <span
                      className="tdb-barre-connexions"
                      style={{
                        height: j.evenements ? `${(j.connexions / j.evenements) * 100}%` : 0,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
            <p className="tdb-axe">
              <span>{jourFr(t.periode.du)}</span>
              <span>{jourFr(t.periode.au)}</span>
            </p>
          </section>

          <section className="tdb-bloc" aria-label="Activité récente">
            <h2>Activité récente</h2>
            {t.activiteRecente.length === 0 ? (
              <p className="kpi-sous">Aucune activité sur la période.</p>
            ) : (
              <ul className="fiche-liste">
                {t.activiteRecente.map((e, i) => (
                  <li key={`${e.horodatage}-${i}`}>
                    <span>
                      <strong>{e.action}</strong> · {acteurFr(e.acteur)}
                      {e.resultat === 'Échec' && <span className="tdb-echec"> · Échec</span>}
                    </span>
                    <span>{dateHeureFr(e.horodatage)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link href="/admin/audit">Ouvrir le journal d’audit</Link>
            </p>
          </section>
        </>
      )}
    </main>
  );
}

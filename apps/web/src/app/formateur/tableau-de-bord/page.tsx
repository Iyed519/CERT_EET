'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AFaireMaintenant } from '../../../components/AFaireMaintenant';
import { CarteIndicateur, GroupeIndicateurs } from '../../../components/CarteIndicateur';
import { EnTetePage } from '../../../components/EnTetePage';
import { EtatVide } from '../../../components/EtatVide';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { SectionPage } from '../../../components/SectionPage';
import { SectionRisque } from '../../../components/PredictionRisque';
import { aFaireFormateur } from '../../../lib/a-faire';
import {
  FormationTableauDeBordFormateur,
  getNombreAlertesSurveillance,
  getSuiviFormation,
  getTableauDeBordFormateur,
  TableauDeBordFormateur,
} from '../../../lib/api';
import {
  jourFr,
  LIBELLES_STATUT_FORMATION_COURT,
  LIBELLES_STATUT_FORMATION_UN,
  nombreFr,
} from '../../../lib/format';
import { avancementMoyen } from '../../../lib/ui-regles';

/** Raccourcis de période (jours, aujourd'hui compris) — comme US-DASH-01. */
const RACCOURCIS = [7, 30, 90, 365];
const CLE_VUE = 'cert_eet.tdb-formateur-vue';

/** Date locale du navigateur au format AAAA-MM-JJ (champ <input type="date">). */
function jourLocal(decalage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toLocaleDateString('sv-SE');
}

const pourcent = (n: number): string => `${nombreFr(n)} %`;
const sur100 = (n: number | null): string => (n === null ? '—' : `${nombreFr(n)} / 100`);

/** Compléments venus du suivi pédagogique existant, par formation (US-UX-03). */
interface Complement {
  avancement: number | null;
  signales: number;
}

/**
 * US-DASH-03 — Tableau de bord global du formateur : toutes ses formations
 * (affectations), sur une période de jours inclus (30 derniers par défaut).
 * Les chiffres « sur la période » portent sur les jours choisis (heure de
 * Tunis) ; les autres sont l'état actuel. Lecture seule ; la sécurité réelle
 * est côté API (403 pour un autre rôle, périmètre limité à ses formations).
 *
 * US-UX-03 — Ordre de lecture : « À faire maintenant », 4 indicateurs clés
 * cliquables, mes formations en cartes (avancement moyen et apprenants
 * signalés par l'IA lus dans le suivi pédagogique existant), apprenants à
 * risque (IA), puis l'activité et les statistiques avec le choix de période.
 */
export default function TableauDeBordFormateurPage(): JSX.Element {
  const [periode, setPeriode] = useState<{ du?: string; au?: string }>({});
  const [raccourci, setRaccourci] = useState<string>('30');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState<TableauDeBordFormateur | null>(null);
  const [alertesSurveillance, setAlertesSurveillance] = useState(0);
  const [complements, setComplements] = useState<Record<string, Complement | null>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vueTableau, setVueTableau] = useState(false);

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

  // US-QCM-15 : alertes de surveillance à examiner (« À faire maintenant »).
  useEffect(() => {
    getNombreAlertesSurveillance()
      .then(setAlertesSurveillance)
      .catch(() => setAlertesSurveillance(0));
  }, []);

  useEffect(() => {
    try {
      setVueTableau(window.localStorage.getItem(CLE_VUE) === 'tableau');
    } catch {
      /* stockage indisponible : vue en cartes */
    }
  }, []);

  // US-UX-03 : avancement moyen et apprenants signalés, une fois par formation.
  const idsFormations = donnees?.mesFormations.map((f) => f.id).join(',') ?? '';
  useEffect(() => {
    if (!idsFormations) return;
    let vivant = true;
    for (const id of idsFormations.split(',')) {
      getSuiviFormation(id)
        .then((s) => {
          if (vivant)
            setComplements((c) => ({
              ...c,
              [id]: { avancement: avancementMoyen(s.apprenants), signales: s.kpis.surveillanceAExaminer },
            }));
        })
        .catch(() => {
          if (vivant) setComplements((c) => ({ ...c, [id]: null }));
        });
    }
    return () => {
      vivant = false;
    };
  }, [idsFormations]);

  const changerVue = (tableau: boolean): void => {
    setVueTableau(tableau);
    try {
      window.localStorage.setItem(CLE_VUE, tableau ? 'tableau' : 'cartes');
    } catch {
      /* choix valable pour la page seulement */
    }
  };

  const choisirRaccourci = (v: string): void => {
    setRaccourci(v);
    const j = Number(v);
    setPeriode({ du: jourLocal(-(j - 1)), au: jourLocal() });
  };

  const appliquer = (e: FormEvent): void => {
    e.preventDefault();
    setRaccourci('');
    setPeriode({ du: du || undefined, au: au || undefined });
  };

  const t = donnees;
  const maxActivite = t ? Math.max(1, ...t.activite.map((j) => j.tentatives + j.livrables)) : 1;
  const libellePeriode = t
    ? `du ${jourFr(t.periode.du)} au ${jourFr(t.periode.au)} · ${t.periode.jours} jour${t.periode.jours > 1 ? 's' : ''}`
    : '';

  return (
    <div className="page">
      <EnTetePage
        titre="Tableau de bord"
        phrase="Ce que vous avez à faire, puis l’état de vos formations en un coup d’œil."
      />

      {/* US-UI-03 : ce qui demande une action d'abord, les indicateurs ensuite. */}
      <AFaireMaintenant
        elements={t ? aFaireFormateur(t, alertesSurveillance) : []}
        chargement={t === null && erreur === null}
        vide={{ texte: 'Aucun livrable à corriger, aucune alerte ouverte. Les indicateurs de vos formations sont ci-dessous.' }}
      />

      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}
      {chargement && !t && <p className="page-subtitle">Chargement…</p>}

      {t && (
        <>
          <section aria-label="Indicateurs clés">
            <GroupeIndicateurs>
              <CarteIndicateur
                libelle="À corriger"
                valeur={nombreFr(t.ateliers.livrablesAEvaluer)}
                icone="correction"
                href="/formateur/livrables"
                etat={t.ateliers.livrablesAEvaluer > 0 ? 'alerte' : 'normal'}
                aide="livrables à corriger ou en correction"
              />
              <CarteIndicateur
                libelle="Alertes"
                valeur={nombreFr(t.alertesOuvertes + alertesSurveillance)}
                icone="alerte"
                href="/formateur/alertes"
                etat={t.alertesOuvertes + alertesSurveillance > 0 ? 'attention' : 'normal'}
                aide={`${nombreFr(t.alertesOuvertes)} décrochage · ${nombreFr(alertesSurveillance)} surveillance`}
              />
              <CarteIndicateur
                libelle="Apprenants actifs"
                valeur={nombreFr(t.apprenants.actifs)}
                icone="apprenants"
                href="/formateur/apprenants"
                aide={`sur ${nombreFr(t.apprenants.inscrits)} inscrits`}
              />
              <CarteIndicateur
                libelle="Réussite aux QCM"
                valeur={t.qcm.tentativesNotees === 0 ? '—' : pourcent(t.qcm.tauxReussite)}
                icone="resultats"
                href="/formateur/qcm"
                aide={`${nombreFr(t.qcm.tentativesNotees)} tentatives notées ${libellePeriode}`}
              />
            </GroupeIndicateurs>
          </section>

          <SectionPage
            titre="Mes formations"
            icone="formation"
            phrase="Chaque carte mène à l’espace de la formation ; les compteurs mènent à ce qui attend."
            actions={
              <FiltresPastilles<'cartes' | 'tableau'>
                libelle="Présentation des formations"
                valeur={vueTableau ? 'tableau' : 'cartes'}
                onChange={(v) => changerVue(v === 'tableau')}
                options={[
                  { valeur: 'cartes', libelle: 'Vue en cartes' },
                  { valeur: 'tableau', libelle: 'Vue tableau' },
                ]}
              />
            }
          >
            {t.mesFormations.length === 0 ? (
              <EtatVide
                titre="Aucune formation pour l’instant"
                texte="Un administrateur vous affecte aux formations. Vous pouvez demander à enseigner une formation existante, ou en proposer une nouvelle."
                action={
                  <Link className="btn btn-lien" href="/formateur/demandes">
                    Demander une formation
                  </Link>
                }
              />
            ) : vueTableau ? (
              <VueTableau formations={t.mesFormations} />
            ) : (
              <ul className="cartes-formation">
                {t.mesFormations.map((f) => (
                  <CarteFormation key={f.id} f={f} complement={complements[f.id]} />
                ))}
              </ul>
            )}
          </SectionPage>

          <SectionRisque lienSuivi />

          <SectionPage
            titre="Activité et statistiques"
            icone="pilotage"
            phrase={`Sur la période ${libellePeriode} (heure de Tunis) ; les autres chiffres sont l’état actuel.`}
            actions={
              <div className="selecteur-periode">
                <FiltresPastilles<string>
                  libelle="Période"
                  valeur={raccourci}
                  onChange={choisirRaccourci}
                  options={RACCOURCIS.map((j) => ({ valeur: String(j), libelle: j === 365 ? '1 an' : `${j} j` }))}
                />
                <details className="periode-perso" open={raccourci === '' ? true : undefined}>
                  <summary className="btn-discret">
                    <Icone nom="calendrier" taille={16} />
                    Personnaliser
                  </summary>
                  <form className="periode-perso-form" onSubmit={appliquer}>
                    <label className="field">
                      <span className="field-label">Du</span>
                      <input className="input" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field-label">Au</span>
                      <input className="input" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
                    </label>
                    <button className="btn-sm btn-primary-sm" type="submit">
                      Appliquer
                    </button>
                  </form>
                </details>
              </div>
            }
          >
            <div className="stats-grille">
              <div className="stats-bloc">
                <h3 className="stats-titre">Formations où vous êtes affecté ({nombreFr(t.formations.total)})</h3>
                <ul className="kpi-repartition">
                  {Object.entries(t.formations.parStatut).map(([statut, n]) => (
                    <li key={statut}>
                      <span>{LIBELLES_STATUT_FORMATION_COURT[statut] ?? statut}</span>
                      <strong>{nombreFr(n)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="stats-bloc">
                <h3 className="stats-titre">Apprenants et évaluations</h3>
                <ul className="kpi-repartition">
                  <li>
                    <span>Inscrits</span>
                    <strong>{nombreFr(t.apprenants.inscrits)}</strong>
                  </li>
                  <li>
                    <span>Nouveaux inscrits sur la période</span>
                    <strong>{nombreFr(t.apprenants.nouveaux)}</strong>
                  </li>
                  <li>
                    <span>Tentatives notées sur la période</span>
                    <strong>{nombreFr(t.qcm.tentativesNotees)}</strong>
                  </li>
                  <li>
                    <span>Score moyen aux QCM</span>
                    <strong>{sur100(t.qcm.scoreMoyen)}</strong>
                  </li>
                  <li>
                    <span>Tentatives à évaluer</span>
                    <strong>{nombreFr(t.qcm.aEvaluer)}</strong>
                  </li>
                  <li>
                    <span>Certificats délivrés sur la période</span>
                    <strong>{nombreFr(t.certificatsDelivres)}</strong>
                  </li>
                </ul>
              </div>
            </div>

            <h3 className="stats-titre">Activité quotidienne</h3>
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
          </SectionPage>
        </>
      )}
    </div>
  );
}

/** Une formation en carte : statut, effectifs, jauge d'avancement, compteurs cliquables. */
function CarteFormation({
  f,
  complement,
}: {
  f: FormationTableauDeBordFormateur;
  complement: Complement | null | undefined;
}): JSX.Element {
  const avancement = complement?.avancement ?? null;
  const signales = complement?.signales ?? 0;
  const compteurs: Array<{ n: number; libelle: string; href: string; classe: string }> = [
    { n: f.livrablesAEvaluer, libelle: 'à corriger', href: '/formateur/livrables', classe: 'compteur-danger' },
    { n: f.alertesOuvertes, libelle: f.alertesOuvertes > 1 ? 'alertes' : 'alerte', href: '/formateur/alertes', classe: 'compteur-attention' },
    { n: signales, libelle: 'signalés par l’IA', href: '/formateur/alertes/surveillance', classe: 'compteur-danger' },
  ].filter((c) => c.n > 0);
  return (
    <li className="carte-formation">
      <div className="carte-formation-tete">
        <Link className="carte-formation-titre" href={`/formateur/formations/${f.id}`}>
          {f.titre}
        </Link>
        <PastilleStatut statut={f.statut} libelle={LIBELLES_STATUT_FORMATION_UN[f.statut] ?? f.statut} />
      </div>
      <dl className="carte-formation-chiffres">
        <div>
          <dt>Inscrits / actifs</dt>
          <dd>
            {nombreFr(f.inscrits)} / {nombreFr(f.actifs)}
          </dd>
        </div>
        <div>
          <dt>Réussite QCM</dt>
          <dd>{f.tentativesNotees === 0 ? '—' : pourcent(f.tauxReussite)}</dd>
        </div>
      </dl>
      <div className="jauge-formation">
        <div className="jauge-formation-tete">
          <span>Avancement moyen</span>
          <strong>{avancement === null ? '—' : `${avancement} %`}</strong>
        </div>
        <div
          className="jauge-formation-barre"
          role="progressbar"
          aria-label={`Avancement moyen — ${f.titre}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={avancement ?? 0}
        >
          <span style={{ width: `${avancement ?? 0}%` }} />
        </div>
      </div>
      {compteurs.length > 0 && (
        <ul className="carte-formation-compteurs">
          {compteurs.map((c) => (
            <li key={c.libelle}>
              <Link className={`compteur-lien ${c.classe}`} href={c.href}>
                <strong>{nombreFr(c.n)}</strong> {c.libelle}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="carte-formation-actions">
        <Link className="btn-sm btn-primary-sm btn-lien" href={`/formateur/formations/${f.id}`}>
          Ouvrir
        </Link>
        <Link className="btn-sm btn-lien" href={`/formateur/formations/${f.id}/suivi`}>
          Suivi
        </Link>
      </div>
    </li>
  );
}

/** US-UX-03 — Le tableau d'avant, à l'identique (toutes les colonnes). */
function VueTableau({ formations }: { formations: FormationTableauDeBordFormateur[] }): JSX.Element {
  return (
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
          {formations.map((f) => (
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

  );
}

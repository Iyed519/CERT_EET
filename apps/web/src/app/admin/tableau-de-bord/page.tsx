'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AFaireMaintenant } from '../../../components/AFaireMaintenant';
import { CarteIndicateur, GroupeIndicateurs } from '../../../components/CarteIndicateur';
import { EnTetePage } from '../../../components/EnTetePage';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone, NomIcone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { SectionPage } from '../../../components/SectionPage';
import { aFaireAdministrateur } from '../../../lib/a-faire';
import { getTableauDeBordGlobal, TableauDeBordGlobal } from '../../../lib/api';
import {
  dateHeureFr,
  jourFr,
  LIBELLES_ROLE,
  LIBELLES_STATUT_CERTIFICAT,
  LIBELLES_STATUT_FORMATION_COURT,
  LIBELLES_STATUT_INSCRIPTION_COURT,
  nombreFr,
} from '../../../lib/format';
import {
  categorieAudit,
  ICONE_CATEGORIE_AUDIT,
  LIBELLES_CATEGORIE_AUDIT,
  libelleActionAudit,
} from '../../../lib/libelles';
import { acteurAudit, repartitionTexte } from '../../../lib/ui-regles';

/** Raccourcis de période (jours, aujourd'hui compris). */
const RACCOURCIS = [7, 30, 90, 365];

/** Date locale du navigateur au format AAAA-MM-JJ (champ <input type="date">). */
function jourLocal(decalage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toLocaleDateString('sv-SE');
}

/** Répartition « 12 apprenants · 3 formateurs » (valeurs nulles omises). */
function repartition(valeurs: Record<string, number>, libelles: Record<string, string>): string {
  return repartitionTexte(valeurs, libelles, nombreFr);
}

/**
 * US-DASH-01 — Tableau de bord global (ADMINISTRATEUR).
 * US-UX-06 — « À faire maintenant » (demandes et alertes, une seule fois), puis les
 * indicateurs groupés par thème, chacun cliquable vers sa liste filtrée, puis l'activité.
 */
export default function TableauDeBordPage(): JSX.Element {
  const [periode, setPeriode] = useState<{ du?: string; au?: string }>({});
  const [raccourci, setRaccourci] = useState('30');
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
    setRaccourci('');
    setPeriode({ du: du || undefined, au: au || undefined });
  };

  const choisirRaccourci = (v: string): void => {
    setRaccourci(v);
    const jours = Number(v);
    setPeriode({ du: jourLocal(-(jours - 1)), au: jourLocal() });
  };

  const t = donnees;
  const maxActivite = t ? Math.max(1, ...t.activite.map((j) => j.evenements)) : 1;
  const libellePeriode = t
    ? `du ${jourFr(t.periode.du)} au ${jourFr(t.periode.au)} · ${t.periode.jours} jour${t.periode.jours > 1 ? 's' : ''}`
    : '';

  return (
    <div className="page">
      <EnTetePage
        titre="Tableau de bord"
        phrase="Ce qui attend votre décision, puis l’état de toute la plateforme en un coup d’œil."
      />

      <div id="alertes">
        <AFaireMaintenant
          elements={t ? aFaireAdministrateur(t) : []}
          chargement={t === null && erreur === null}
          vide={{ texte: 'Aucune demande en attente, aucune alerte système. Les indicateurs de la plateforme sont ci-dessous.' }}
        />
      </div>

      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}
      {chargement && !t && <p>Chargement…</p>}

      {t && (
        <>
          <SectionPage
            titre="Indicateurs"
            icone="pilotage"
            phrase={`« Sur la période » : ${libellePeriode} (heure de Tunis) ; les autres chiffres sont l’état actuel. Chaque carte mène à sa liste.`}
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
            <GroupeIndicateurs titre="Personnes" icone="utilisateurs">
              <CarteIndicateur
                libelle="Comptes"
                valeur={nombreFr(t.utilisateurs.total)}
                icone="utilisateurs"
                href="/admin/utilisateurs"
                aide={repartition(t.utilisateurs.parRole, LIBELLES_ROLE)}
              />
              <CarteIndicateur
                libelle="Connectés sur la période"
                valeur={nombreFr(t.utilisateurs.connectes)}
                icone="connexion"
                href="/admin/audit"
                aide={`${nombreFr(t.utilisateurs.nouveaux)} nouveaux comptes sur la période`}
              />
            </GroupeIndicateurs>

            <GroupeIndicateurs titre="Formations" icone="formation">
              <CarteIndicateur
                libelle="Formations ouvertes"
                valeur={nombreFr(t.formations.parStatut.OUVERTE ?? 0)}
                icone="formation"
                href="/admin/formations?statut=OUVERTE"
                aide={`${nombreFr(t.formations.total)} au total : ${repartition(t.formations.parStatut, LIBELLES_STATUT_FORMATION_COURT)} · ${nombreFr(t.formations.nouvelles)} créées sur la période`}
              />
              <CarteIndicateur
                libelle="Formations en brouillon"
                valeur={nombreFr(t.formations.parStatut.BROUILLON ?? 0)}
                icone="brouillon"
                href="/admin/formations?statut=BROUILLON"
                etat={(t.formations.parStatut.BROUILLON ?? 0) > 0 ? 'attention' : 'normal'}
                aide="à préparer puis publier"
              />
              <CarteIndicateur
                libelle="Inscriptions"
                valeur={nombreFr(t.inscriptions.total)}
                icone="apprenants"
                href="/admin/formations"
                aide={`${repartition(t.inscriptions.parStatut, LIBELLES_STATUT_INSCRIPTION_COURT)} · ${nombreFr(t.inscriptions.nouvelles)} sur la période`}
              />
            </GroupeIndicateurs>

            <GroupeIndicateurs titre="Évaluations" icone="qcm">
              <CarteIndicateur
                libelle="Réussite aux QCM"
                valeur={t.evaluations.qcm.tentativesNotees === 0 ? '—' : `${nombreFr(t.evaluations.qcm.tauxReussite)} %`}
                icone="resultats"
                aide={`${nombreFr(t.evaluations.qcm.tentativesNotees)} tentatives notées sur la période · score moyen ${
                  t.evaluations.qcm.scoreMoyen === null ? '—' : `${nombreFr(t.evaluations.qcm.scoreMoyen)} / 100`
                } · ${nombreFr(t.evaluations.qcm.enCours)} en cours maintenant`}
              />
              <CarteIndicateur
                libelle="Livrables d’atelier"
                valeur={nombreFr(t.evaluations.ateliers.livrablesSoumis)}
                icone="livrable"
                etat={t.evaluations.ateliers.enAttenteCorrection > 0 ? 'attention' : 'normal'}
                aide={`déposés sur la période · ${nombreFr(t.evaluations.ateliers.enAttenteCorrection)} à corriger / ${nombreFr(t.evaluations.ateliers.enCorrection)} en correction · ${nombreFr(t.evaluations.ateliers.correctionsFinalisees)} corrections finalisées, note moyenne ${
                  t.evaluations.ateliers.noteMoyenne === null ? '—' : `${nombreFr(t.evaluations.ateliers.noteMoyenne)} / 100`
                }`}
              />
            </GroupeIndicateurs>

            <GroupeIndicateurs titre="Certificats" icone="certificat">
              <CarteIndicateur
                libelle="Certificats émis"
                valeur={nombreFr(t.certificats.emis)}
                icone="certificat"
                href="/admin/certificats?statut=ACTIF"
                etat="succes"
                aide={repartition(t.certificats.parStatut, LIBELLES_STATUT_CERTIFICAT)}
              />
              <CarteIndicateur
                libelle="Certificats révoqués"
                valeur={nombreFr(t.certificats.revoques)}
                icone="erreur"
                href="/admin/certificats?statut=REVOQUE"
                aide="consulter les motifs de révocation"
              />
              <CarteIndicateur
                libelle="Vérifications publiques"
                valeur={nombreFr(t.certificats.consultations)}
                icone="audit"
                href="/admin/certificats"
                aide="consultations de la page de vérification sur la période"
              />
            </GroupeIndicateurs>
          </SectionPage>

          <SectionPage
            titre="Activité"
            icone="activite"
            phrase="Les dernières actions tracées, puis le nombre d’événements par jour."
            actions={
              <Link className="btn-sm btn-lien" href="/admin/audit">
                <Icone nom="audit" taille={16} />
                Ouvrir le journal d’audit
              </Link>
            }
          >
            <h3 className="stats-titre">Activité récente</h3>
            {t.activiteRecente.length === 0 ? (
              <p className="kpi-sous">Aucune activité sur la période.</p>
            ) : (
              <ul className="activite-liste">
                {t.activiteRecente.map((e, i) => {
                  const categorie = categorieAudit(e.action);
                  const echec = e.resultat === 'Échec';
                  return (
                    <li key={`${e.horodatage}-${i}`} className={`activite-ligne${echec ? ' activite-echec' : ''}`}>
                      <span className={`activite-icone activite-${categorie}`}>
                        <Icone nom={ICONE_CATEGORIE_AUDIT[categorie] as NomIcone} taille={18} />
                      </span>
                      <span className="activite-corps">
                        <span className="activite-libelle">{libelleActionAudit(e.action)}</span>
                        <span className="activite-detail">
                          {acteurAudit(e.acteur)} · {LIBELLES_CATEGORIE_AUDIT[categorie]}
                        </span>
                      </span>
                      {echec && <PastilleStatut ton="danger" libelle="Échec" />}
                      <time className="activite-heure" dateTime={e.horodatage}>
                        {dateHeureFr(e.horodatage)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="stats-titre activite-quotidienne-titre">Activité quotidienne</h3>
            <p className="kpi-sous">Événements du journal d’audit par jour (dont connexions réussies en foncé).</p>
            <div className="tdb-graphe" role="img" aria-label="Événements par jour">
              {t.activite.map((j) => (
                <div
                  key={j.jour}
                  className="tdb-barre"
                  title={`${jourFr(j.jour)} : ${j.evenements} événement(s), ${j.connexions} connexion(s), ${j.echecs} échec(s)`}
                >
                  <span className="tdb-barre-total" style={{ height: `${(j.evenements / maxActivite) * 100}%` }}>
                    <span
                      className="tdb-barre-connexions"
                      style={{ height: j.evenements ? `${(j.connexions / j.evenements) * 100}%` : 0 }}
                    />
                  </span>
                </div>
              ))}
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

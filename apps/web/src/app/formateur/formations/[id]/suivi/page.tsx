'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AdminError,
  ApprenantSuivi,
  FicheApprenantSuivi,
  getFicheApprenantSuivi,
  getSuiviFormation,
  SuiviFormation,
} from '../../../../../lib/api';
import {
  dateHeureFr,
  dureeFr,
  jourFr,
  LIBELLES_INSCRIPTION,
  LIBELLES_LIVRABLE_FORMATEUR,
  LIBELLES_STATUT_CERTIFICAT,
  LIBELLES_TENTATIVE,
  nombreFr,
  nomApprenantFr,
} from '../../../../../lib/format';

type Tri = 'nom' | 'avancement' | 'moyenne' | 'activite';
type Filtre = 'tous' | 'inactifs' | 'EN_COURS' | 'TERMINEE' | 'SUSPENDUE';

const TRIS: Array<[Tri, string]> = [
  ['nom', 'Nom'],
  ['avancement', 'Avancement'],
  ['moyenne', 'Moyenne'],
  ['activite', 'Dernière activité'],
];

const FILTRES: Array<[Filtre, string]> = [
  ['tous', 'Tous'],
  ['inactifs', 'Inactifs (> 7 j)'],
  ['EN_COURS', 'En cours'],
  ['TERMINEE', 'Terminés'],
  ['SUSPENDUE', 'Suspendus'],
];

const surCent = (v: number | null): string => (v === null ? '—' : `${nombreFr(v)} / 100`);

/** Comparateur : valeurs nulles toujours en fin de liste. */
function comparer(tri: Tri): (a: ApprenantSuivi, b: ApprenantSuivi) => number {
  const nulsEnFin = (x: number | null, y: number | null): number =>
    x === null ? (y === null ? 0 : 1) : y === null ? -1 : y - x;
  switch (tri) {
    case 'avancement':
      return (a, b) => b.avancement - a.avancement;
    case 'moyenne':
      return (a, b) => nulsEnFin(a.moyenne, b.moyenne);
    case 'activite':
      return (a, b) =>
        nulsEnFin(
          a.derniereActivite ? Date.parse(a.derniereActivite) : null,
          b.derniereActivite ? Date.parse(b.derniereActivite) : null,
        );
    default:
      return (a, b) => nomApprenantFr(a).localeCompare(nomApprenantFr(b), 'fr');
  }
}

/**
 * US-SUIVI-01 — Tableau de bord pédagogique d'une formation (DS-14 P1).
 *
 * Indicateurs, histogramme des moyennes, tableau des apprenants triable et
 * filtrable (recherche, statut, inactifs) avec badge de risque, fiche
 * détaillée en modale. Formateur affecté ou administrateur : l'API refuse
 * les autres (403 tracé) — la page affiche alors le message.
 */
export default function SuiviFormationPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [suivi, setSuivi] = useState<SuiviFormation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tri, setTri] = useState<Tri>('nom');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [ficheId, setFicheId] = useState<string | null>(null);

  useEffect(() => {
    getSuiviFormation(id)
      .then(setSuivi)
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger le suivi.'),
      );
  }, [id]);

  const lignes = useMemo(() => {
    if (!suivi) return [];
    const q = recherche.trim().toLowerCase();
    return suivi.apprenants
      .filter((a) =>
        filtre === 'tous'
          ? true
          : filtre === 'inactifs'
            ? a.risque.inactif
            : a.statutInscription === filtre,
      )
      .filter(
        (a) =>
          !q ||
          nomApprenantFr(a).toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q),
      )
      .sort(comparer(tri));
  }, [suivi, tri, filtre, recherche]);

  const maxHisto = suivi ? Math.max(1, ...suivi.histogramme.map((t) => t.effectif)) : 1;
  const k = suivi?.kpis;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href={`/formateur/formations/${id}`}>
          ← La formation
        </Link>
      </p>
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {!suivi && erreur === null && <p className="page-subtitle">Chargement…</p>}

      {suivi && k && (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">Suivi pédagogique</h1>
              <p className="page-subtitle">
                {suivi.formation.titre} · {k.qcmPublies} QCM et {k.ateliersPublies} atelier
                {k.ateliersPublies > 1 ? 's' : ''} publiés
              </p>
            </div>
          </div>

          <section className="tdb-grille" aria-label="Indicateurs">
            <article className="kpi">
              <h2>Apprenants</h2>
              <p className="kpi-valeur">{k.inscrits}</p>
              <ul className="kpi-repartition">
                <li>
                  <span>Actifs</span>
                  <strong>{k.actifs}</strong>
                </li>
                <li>
                  <span>Inactifs depuis plus de 7 jours</span>
                  <strong className={k.inactifs > 0 ? 'tdb-echec' : undefined}>{k.inactifs}</strong>
                </li>
                <li>
                  <span>Terminés / suspendus</span>
                  <strong>
                    {k.termines} / {k.suspendus}
                  </strong>
                </li>
              </ul>
            </article>
            <article className="kpi">
              <h2>Complétion</h2>
              <p className="kpi-valeur">{nombreFr(k.tauxCompletion)} %</p>
              <p className="kpi-sous">évaluations publiées réussies ou notées (moyenne)</p>
              <ul className="kpi-repartition">
                <li>
                  <span>Certifiés</span>
                  <strong>{k.certifies}</strong>
                </li>
              </ul>
            </article>
            <article className="kpi">
              <h2>Scores</h2>
              <ul className="kpi-repartition">
                <li>
                  <span>QCM (meilleure tentative)</span>
                  <strong>{surCent(k.scoreMoyenQcm)}</strong>
                </li>
                <li>
                  <span>Ateliers</span>
                  <strong>{surCent(k.noteMoyenneAteliers)}</strong>
                </li>
              </ul>
              <div className="histo" role="img" aria-label="Répartition des moyennes">
                {suivi.histogramme.map((t) => (
                  <div key={t.tranche} className="histo-col" title={`${t.tranche} : ${t.effectif}`}>
                    <span className="histo-barre" style={{ height: `${(t.effectif / maxHisto) * 100}%` }} />
                    <span className="histo-etiquette">{t.min}</span>
                  </div>
                ))}
              </div>
              <p className="kpi-sous">Moyennes des apprenants, par tranche de 10 points.</p>
            </article>
          </section>

          <section className="tdb-bloc" aria-label="Apprenants">
            <div className="filters suivi-filtres">
              <label className="field">
                <span className="field-label">Rechercher</span>
                <input
                  className="input"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Nom ou email"
                />
              </label>
              <label className="field">
                <span className="field-label">Afficher</span>
                <select className="input" value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)}>
                  {FILTRES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Trier par</span>
                <select className="input" value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
                  {TRIS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {lignes.length === 0 ? (
              <p className="kpi-sous">Aucun apprenant ne correspond.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table suivi-table">
                  <thead>
                    <tr>
                      <th>Apprenant</th>
                      <th>Avancement</th>
                      <th>QCM</th>
                      <th>Ateliers</th>
                      <th>Moyenne</th>
                      <th>Dernière activité</th>
                      <th aria-label="Fiche" />
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{nomApprenantFr(a)}</strong>
                          <br />
                          <small>
                            {LIBELLES_INSCRIPTION[a.statutInscription]}
                            {a.certificat === 'ACTIF' && ' · certifié'}
                          </small>
                          {a.risque.inactif && (
                            <span className="badge-risque" title="Aucune connexion depuis plus de 7 jours">
                              Inactif · {a.risque.joursSansConnexion} j
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="jauge" aria-hidden="true">
                            <span style={{ width: `${a.avancement}%` }} />
                          </span>
                          {nombreFr(a.avancement)} %
                        </td>
                        <td>
                          {a.qcm.reussis}/{a.qcm.total} réussis
                          <br />
                          <small>{surCent(a.qcm.scoreMoyen)}</small>
                        </td>
                        <td>
                          {a.ateliers.notes}/{a.ateliers.total} notés
                          <br />
                          <small>
                            {surCent(a.ateliers.noteMoyenne)}
                            {a.ateliers.enRetard > 0 && ` · ${a.ateliers.enRetard} en retard`}
                            {a.ateliers.nonRendus > 0 && ` · ${a.ateliers.nonRendus} non rendu(s)`}
                          </small>
                        </td>
                        <td>{surCent(a.moyenne)}</td>
                        <td>{a.derniereActivite ? jourFr(a.derniereActivite) : '—'}</td>
                        <td>
                          <button type="button" className="btn-sm" onClick={() => setFicheId(a.id)}>
                            Fiche
                          </button>
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

      {ficheId && <FicheModal formationId={id} apprenantId={ficheId} onClose={() => setFicheId(null)} />}
    </>
  );
}

function FicheModal({
  formationId,
  apprenantId,
  onClose,
}: {
  formationId: string;
  apprenantId: string;
  onClose: () => void;
}): JSX.Element {
  const [fiche, setFiche] = useState<FicheApprenantSuivi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getFicheApprenantSuivi(formationId, apprenantId)
      .then(setFiche)
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger la fiche.'),
      );
  }, [formationId, apprenantId]);

  const a = fiche?.apprenant;
  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-fiche-apprenant">
      <section className="profil-card fiche-certificat">
        <h1 id="titre-fiche-apprenant" className="auth-title">
          {a ? nomApprenantFr(a) : 'Fiche de l’apprenant'}
        </h1>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {!fiche && erreur === null && <p className="page-subtitle">Chargement…</p>}
        {fiche && a && (
          <>
            <dl className="fiche-grille">
              <dt>Email</dt>
              <dd>{a.email}</dd>
              <dt>Inscription</dt>
              <dd>
                {LIBELLES_INSCRIPTION[a.statutInscription]} depuis le {jourFr(a.dateInscription)}
              </dd>
              <dt>Dernière connexion</dt>
              <dd>{a.derniereConnexion ? dateHeureFr(a.derniereConnexion) : 'Jamais'}</dd>
              <dt>Avancement</dt>
              <dd>{nombreFr(a.avancement)} %</dd>
              <dt>Certificat</dt>
              <dd>
                {fiche.certificat
                  ? `${LIBELLES_STATUT_CERTIFICAT[fiche.certificat.statut]} (${nombreFr(fiche.certificat.scoreFinal)} / 100)`
                  : 'Aucun'}
              </dd>
            </dl>

            <h2 className="fiche-titre">Tentatives QCM ({fiche.tentatives.length})</h2>
            {fiche.tentatives.length === 0 ? (
              <p className="kpi-sous">Aucune tentative.</p>
            ) : (
              <ul className="fiche-liste">
                {fiche.tentatives.map((t) => (
                  <li key={t.id}>
                    <span>
                      {t.qcmTitre} · {LIBELLES_TENTATIVE[t.statut]}
                      {t.dureeEffective !== null && ` · ${dureeFr(Math.round(t.dureeEffective / 60))}`}
                    </span>
                    <span>
                      {t.score !== null ? `${nombreFr(t.score)} / 100${t.reussie ? ' ✓' : ''}` : '—'} ·{' '}
                      {jourFr(t.dateDebut)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="fiche-titre">Livrables ({fiche.livrables.length})</h2>
            {fiche.livrables.length === 0 ? (
              <p className="kpi-sous">Aucun livrable.</p>
            ) : (
              <ul className="fiche-liste">
                {fiche.livrables.map((l) => (
                  <li key={l.id}>
                    <span>
                      {l.atelierTitre} · v{l.version} · {LIBELLES_LIVRABLE_FORMATEUR[l.statut]}
                      {l.enRetard && ' · en retard'}
                    </span>
                    <span>
                      {l.note !== null ? `${nombreFr(l.note)} / 100` : '—'} · {jourFr(l.dateSoumission)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="fiche-titre">Chronologie</h2>
            <ul className="fiche-liste fiche-historique">
              {fiche.chronologie.map((e, i) => (
                <li key={`${e.date}-${i}`}>
                  <span>{e.libelle}</span>
                  <span>{dateHeureFr(e.date)}</span>
                </li>
              ))}
            </ul>
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

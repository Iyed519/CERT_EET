'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getResumeRisque,
  getRisqueFormation,
  LigneRisque,
  NiveauRisque,
  ResumeRisqueFormation,
  RisqueFormation,
} from '../lib/api';
import { dateHeureFr, LIBELLES_CRITERE_ALERTE, nomApprenantFr, nombreFr } from '../lib/format';

/** Libellé toujours affiché : le niveau n'est jamais porté par la couleur seule. */
export const LIBELLES_NIVEAU_RISQUE: Record<NiveauRisque, string> = {
  ELEVE: 'Risque élevé',
  MOYEN: 'Risque moyen',
  FAIBLE: 'Risque faible',
};

const RAPPEL = 'Suggestion du modèle, à valider par le formateur.';

const messageDe = (e: unknown, defaut: string): string => (e instanceof Error ? e.message : defaut);

/**
 * IA — Prédiction des apprenants à risque (suggestion du modèle, complément
 * des alertes à règles). Résumé par formation puis, pour la formation
 * choisie, chaque apprenant avec son niveau suggéré, 3 raisons en français et
 * les alertes ouvertes des règles existantes. L'API filtre le périmètre
 * (formateur : ses formations ; administrateur : toutes).
 *
 * `lienSuivi` : lien vers le suivi pédagogique de la formation (formateur).
 */
export function SectionRisque({ lienSuivi = false }: { lienSuivi?: boolean }): JSX.Element {
  const [resume, setResume] = useState<ResumeRisqueFormation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisie, setChoisie] = useState<string>('');

  useEffect(() => {
    getResumeRisque()
      .then((r) => {
        // Les formations les plus concernées d'abord : élevé, moyen, puis inscrits.
        const tri = [...r].sort(
          (a, b) => b.eleve - a.eleve || b.moyen - a.moyen || b.inscrits - a.inscrits,
        );
        setResume(tri);
        setChoisie((c) => c || (tri[0]?.formation.id ?? ''));
      })
      .catch((e: unknown) => setErreur(messageDe(e, 'Impossible de charger la prédiction du risque.')));
  }, []);

  return (
    <section className="tdb-bloc" aria-labelledby="titre-risque">
      <h2 id="titre-risque">Apprenants à risque (IA)</h2>
      <p className="kpi-sous">
        <strong>{RAPPEL}</strong> Le niveau est calculé chaque jour à partir de l’activité, des remises
        et des notes. Il complète les alertes des règles (affichées à côté), sans les remplacer.
      </p>

      {erreur !== null && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}
      {resume === null && erreur === null && <p className="kpi-sous">Chargement…</p>}
      {resume !== null && resume.length === 0 && (
        <p className="kpi-sous">Aucune formation ouverte ou fermée à afficher.</p>
      )}

      {resume !== null && resume.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Répartition des niveaux de risque par formation</caption>
              <thead>
                <tr>
                  <th scope="col">Formation</th>
                  <th scope="col">Inscrits</th>
                  <th scope="col">Élevé</th>
                  <th scope="col">Moyen</th>
                  <th scope="col">Faible</th>
                  <th scope="col">Sans prédiction</th>
                  <th scope="col">Alertes (règles)</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {resume.map((f) => (
                  <tr key={f.formation.id}>
                    <td>{f.formation.titre}</td>
                    <td>{nombreFr(f.inscrits)}</td>
                    <td>{nombreFr(f.eleve)}</td>
                    <td>{nombreFr(f.moyen)}</td>
                    <td>{nombreFr(f.faible)}</td>
                    <td>
                      {f.disponible || f.inscrits === 0 ? (
                        nombreFr(f.sansPrediction)
                      ) : (
                        <span className="muted-cell">Prédiction indisponible</span>
                      )}
                    </td>
                    <td>{nombreFr(f.alertesOuvertes)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm"
                        aria-pressed={choisie === f.formation.id}
                        onClick={() => setChoisie(f.formation.id)}
                      >
                        {choisie === f.formation.id ? 'Affichée' : 'Voir les apprenants'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resume.length > 1 && (
            <label className="field risque-choix">
              <span className="field-label">Formation affichée</span>
              <select className="input" value={choisie} onChange={(e) => setChoisie(e.target.value)}>
                {resume.map((f) => (
                  <option key={f.formation.id} value={f.formation.id}>
                    {f.formation.titre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {choisie && <ApprenantsRisque key={choisie} formationId={choisie} lienSuivi={lienSuivi} />}
        </>
      )}
    </section>
  );
}

/** Apprenants d'une formation : niveau suggéré, raisons, alertes des règles. */
export function ApprenantsRisque({
  formationId,
  lienSuivi = false,
}: {
  formationId: string;
  lienSuivi?: boolean;
}): JSX.Element {
  const [donnees, setDonnees] = useState<RisqueFormation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getRisqueFormation(formationId)
      .then(setDonnees)
      .catch((e: unknown) => setErreur(messageDe(e, 'Impossible de charger la prédiction du risque.')));
  }, [formationId]);

  if (erreur !== null) {
    return (
      <p className="alert alert-error risque-bloc" role="alert">
        {erreur}
      </p>
    );
  }
  if (donnees === null) return <p className="kpi-sous risque-bloc">Chargement…</p>;

  return (
    <div className="risque-bloc" aria-live="polite">
      <div className="risque-entete">
        <h3 className="risque-titre">{donnees.formation.titre}</h3>
        {lienSuivi && (
          <Link className="btn-sm btn-link" href={`/formateur/formations/${formationId}/suivi`}>
            Suivi pédagogique
          </Link>
        )}
      </div>
      {donnees.apprenants.length === 0 ? null : donnees.disponible ? (
        <p className="kpi-sous">
          Calculé le {donnees.dateCalcul ? dateHeureFr(donnees.dateCalcul) : '—'} · modèle{' '}
          {donnees.versionModele}
        </p>
      ) : (
        <p className="alert alert-info" role="status">
          Prédiction indisponible pour l’instant (service de prédiction arrêté ou calcul pas encore
          fait). Les alertes des règles restent actives.
        </p>
      )}
      {donnees.apprenants.length === 0 ? (
        <p className="kpi-sous">Aucun apprenant inscrit en cours.</p>
      ) : (
        <ul className="risque-liste">
          {donnees.apprenants.map((l) => (
            <CarteApprenant key={l.inscriptionId} ligne={l} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CarteApprenant({ ligne }: { ligne: LigneRisque }): JSX.Element {
  const r = ligne.risque;
  return (
    <li className={`risque-carte${r ? ` risque-carte-${r.niveau}` : ''}`}>
      <div className="risque-tete">
        <strong className="risque-nom">{nomApprenantFr(ligne.apprenant)}</strong>
        {r ? (
          <span className={`statut-badge niveau-${r.niveau}`}>{LIBELLES_NIVEAU_RISQUE[r.niveau]}</span>
        ) : (
          <span className="statut-badge niveau-AUCUN">Prédiction indisponible</span>
        )}
      </div>
      {r && r.niveau !== 'FAIBLE' && r.raisons.length > 0 && (
        <ul className="risque-raisons" aria-label="Raisons suggérées par le modèle">
          {r.raisons.map((raison) => (
            <li key={raison}>{raison}</li>
          ))}
        </ul>
      )}
      {r && (r.niveau === 'FAIBLE' || r.raisons.length === 0) && (
        <p className="kpi-sous risque-texte">Pas de signal de risque important.</p>
      )}
      <p className="kpi-sous risque-texte">
        Alertes des règles :{' '}
        {ligne.alertesOuvertes.length === 0
          ? 'aucune ouverte'
          : ligne.alertesOuvertes.map((c) => (
              <span key={c} className="badge-alerte">
                {LIBELLES_CRITERE_ALERTE[c] ?? c}
              </span>
            ))}
      </p>
    </li>
  );
}

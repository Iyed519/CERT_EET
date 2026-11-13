'use client';
import Link from 'next/link';
import { EtatVide } from '../../components/EtatVide';
import { Fenetre } from '../../components/Fenetre';
import { useCallback, useEffect, useState } from 'react';
import { BoutonRapportPdf } from '../../components/BoutonRapportPdf';
import {
  AdminError,
  DetailHistoriqueApprenant,
  getMaTentative,
  getMesTentatives,
  LigneHistorique,
} from '../../lib/api';
import {
  attenteCorrigeFr,
  dateHeureFr,
  dureeSecondesFr,
  LIBELLES_TENTATIVE,
  scoreFr,
} from '../../lib/format';

/**
 * US-QCM-11 — « Mes tentatives » (apprenant) : historique complet, en
 * lecture seule, les plus récentes d'abord. Détail d'une tentative : les
 * questions vues et mes choix — sans bonne réponse ; le corrigé reste sur la
 * page de la tentative, quand il est disponible (US-QCM-09). US-QCM-13 : rapport
 * PDF de chaque tentative notée (corrigé inclus selon la même règle).
 */
export default function MesTentativesPage(): JSX.Element {
  const [liste, setListe] = useState<LigneHistorique[] | null>(null);
  const [detail, setDetail] = useState<DetailHistoriqueApprenant | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getMesTentatives());
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger vos tentatives.');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvrir = async (id: string): Promise<void> => {
    setErreur(null);
    try {
      setDetail(await getMaTentative(id));
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger cette tentative.');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes évaluations</h1>
          <p className="page-subtitle">
            Toutes vos tentatives aux QCM, telles qu’enregistrées : ouvrez-en une pour revoir vos
            réponses ou télécharger son rapport.
          </p>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {liste === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : liste.length === 0 ? (
        <EtatVide
          titre="Aucune évaluation passée"
          texte="Vos tentatives aux QCM s’afficheront ici. Les évaluations ouvertes sont dans « À faire maintenant »."
          action={
            <Link className="btn btn-lien" href="/mon-espace">
              Aller à mon espace
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>QCM</th>
                <th>Tentative</th>
                <th>Début</th>
                <th>Durée</th>
                <th>Statut</th>
                <th>Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="cellule-titre">{l.qcmTitre}</span>
                    <span className="field-hint">{l.formationTitre}</span>
                  </td>
                  <td>n° {l.numero}</td>
                  <td>{dateHeureFr(l.dateDebut)}</td>
                  <td>{dureeSecondesFr(l.dureeSecondes)}</td>
                  <td>{LIBELLES_TENTATIVE[l.statut]}</td>
                  <td>
                    {l.score === null
                      ? '—'
                      : `${scoreFr(l.score)}${l.estReussie ? ' · réussie' : ' · non réussie'}`}
                  </td>
                  <td>
                    <span className="cellule-actions">
                      <button type="button" className="btn-sm" onClick={() => void ouvrir(l.id)}>
                        Détail
                      </button>
                      {/* US-QCM-13 — rapport PDF d'une tentative notée. */}
                      {l.statut === 'NOTEE' && <BoutonRapportPdf tentativeId={l.id} petit />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Fenetre
          taille="large"
          titre={`${detail.qcmTitre} — tentative n° ${detail.numero}`}
          sousTitre={
            <>
              {LIBELLES_TENTATIVE[detail.statut]} · commencée le {dateHeureFr(detail.dateDebut)}
              {detail.dateFin ? ` · terminée le ${dateHeureFr(detail.dateFin)}` : ''} · durée{' '}
              {dureeSecondesFr(detail.dureeSecondes)} · {detail.nbRepondues} / {detail.nbQuestions}{' '}
              réponses
              {detail.score !== null ? ` · ${scoreFr(detail.score)}` : ''}
            </>
          }
          onClose={() => setDetail(null)}
        >
            {detail.statut === 'NOTEE' && (
              <p className="historique-rapport">
                <BoutonRapportPdf tentativeId={detail.id} />
              </p>
            )}
            {detail.statut === 'EN_COURS' ? (
              <p className="alert">
                Tentative en cours :{' '}
                <Link className="table-link" href={`/tentatives/${detail.id}`}>
                  reprendre le passage
                </Link>
                .
              </p>
            ) : detail.correction.disponible ? (
              <p className="alert alert-success">
                Le corrigé est disponible :{' '}
                <Link className="table-link" href={`/tentatives/${detail.id}`}>
                  voir le corrigé
                </Link>
                .
              </p>
            ) : (
              attenteCorrigeFr(detail.correction.raison, detail.correction.disponibleLe) && (
                <p className="alert">
                  {attenteCorrigeFr(detail.correction.raison, detail.correction.disponibleLe)}
                </p>
              )
            )}
            <ol className="historique-questions">
              {detail.questions.map((q) => {
                const choisies = detail.reponses[q.id] ?? [];
                return (
                  <li key={q.id}>
                    <p className="historique-enonce">{q.enonce}</p>
                    <ul className="historique-options">
                      {q.options.map((o) => (
                        <li
                          key={o.id}
                          className={choisies.includes(o.id) ? 'historique-cochee' : undefined}
                        >
                          <span aria-hidden="true">{choisies.includes(o.id) ? '☑' : '☐'}</span>{' '}
                          {o.texte}
                          {choisies.includes(o.id) && <span className="sr-only"> (cochée)</span>}
                        </li>
                      ))}
                    </ul>
                    {choisies.length === 0 && <p className="field-hint">Sans réponse.</p>}
                  </li>
                );
              })}
            </ol>
        </Fenetre>
      )}
    </>
  );
}

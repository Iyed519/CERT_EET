'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BoutonRapportPdf } from '../../../../../components/BoutonRapportPdf';
import {
  AdminError,
  DetailHistoriqueFormateur,
  getCapturesTentative,
  getTentativeFormateur,
  lienCapture,
  getTentativesQcm,
  LigneHistoriqueFormateur,
  CapturesTentative,
} from '../../../../../lib/api';
import {
  dateHeureFr,
  dureeSecondesFr,
  LIBELLES_TENTATIVE,
  pointsFr,
  scoreFr,
} from '../../../../../lib/format';

const nomApprenant = (a: LigneHistoriqueFormateur['apprenant']): string =>
  [a.prenom, a.nom].filter(Boolean).join(' ') || a.email;

/**
 * US-QCM-11 — Tentatives d'un QCM, côté formateur affecté : historique
 * complet en lecture seule (apprenant, rang, dates, durée, score) ; détail
 * d'une tentative avec le corrigé (cochées, bonnes réponses, points).
 * US-QCM-13 : rapport PDF de chaque tentative notée, corrigé inclus.
 */
export default function TentativesQcmPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [liste, setListe] = useState<LigneHistoriqueFormateur[] | null>(null);
  const [filtre, setFiltre] = useState('');
  const [detail, setDetail] = useState<DetailHistoriqueFormateur | null>(null);
  // US-QCM-12 — captures webcam de la tentative ouverte (chargées à la demande :
  // chaque consultation est journalisée).
  const [captures, setCaptures] = useState<CapturesTentative | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [erreurCaptures, setErreurCaptures] = useState<string | null>(null);

  const voirCaptures = async (tentativeId: string): Promise<void> => {
    setErreurCaptures(null);
    try {
      const liste = await getCapturesTentative(tentativeId);
      setCaptures(liste);
      const liens = await Promise.all(
        liste.captures.map(async (c) => [c.id, await lienCapture(c.id)] as const),
      );
      setImages(Object.fromEntries(liens));
    } catch (e) {
      setErreurCaptures(e instanceof AdminError ? e.message : 'Impossible de charger les captures.');
    }
  };
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getTentativesQcm(id));
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les tentatives.');
    }
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvrir = async (tentativeId: string): Promise<void> => {
    setErreur(null);
    try {
      setCaptures(null);
      setImages({});
      setErreurCaptures(null);
      setDetail(await getTentativeFormateur(id, tentativeId));
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger cette tentative.');
    }
  };

  const recherche = filtre.trim().toLowerCase();
  const visibles = (liste ?? []).filter(
    (l) =>
      recherche === '' ||
      nomApprenant(l.apprenant).toLowerCase().includes(recherche) ||
      l.apprenant.email.toLowerCase().includes(recherche),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <Link className="table-link" href={`/formateur/qcm/${id}`}>
            ← Retour au QCM
          </Link>
          <h1 className="page-title">Tentatives{liste?.[0] ? ` — ${liste[0].qcmTitre}` : ''}</h1>
          <p className="page-subtitle">
            Historique complet et immuable : chaque tentative telle qu’elle a été passée et notée.
          </p>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {liste === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="carte-ailleurs">Aucune tentative pour l’instant.</p>
      ) : (
        <>
          <input
            className="input filtre-apprenant"
            type="search"
            aria-label="Filtrer par apprenant"
            placeholder="Filtrer par apprenant"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
          />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Apprenant</th>
                  <th>Tentative</th>
                  <th>Début</th>
                  <th>Durée</th>
                  <th>Statut</th>
                  <th>Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="cellule-titre">{nomApprenant(l.apprenant)}</span>
                      <span className="field-hint">{l.apprenant.email}</span>
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
                        {/* US-QCM-13 — rapport PDF, corrigé inclus. */}
                        {l.statut === 'NOTEE' && (
                          <BoutonRapportPdf tentativeId={l.id} qcmId={id} petit />
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <div className="profil-overlay" role="dialog" aria-modal="true">
          <section className="profil-card modal-closable modal-wide">
            <button
              type="button"
              className="modal-close"
              aria-label="Fermer"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
            <h2 className="auth-title">
              {nomApprenant(detail.apprenant)} — tentative n° {detail.numero}
            </h2>
            <p className="auth-subtitle">
              {LIBELLES_TENTATIVE[detail.statut]} · {dateHeureFr(detail.dateDebut)} · durée{' '}
              {dureeSecondesFr(detail.dureeSecondes)} · {detail.nbRepondues} / {detail.nbQuestions}{' '}
              réponses
              {detail.score !== null ? ` · ${scoreFr(detail.score)}` : ''}
            </p>
            {detail.statut === 'NOTEE' && (
              <p className="historique-rapport">
                <BoutonRapportPdf tentativeId={detail.id} qcmId={id} />
              </p>
            )}
            <section className="captures-section" aria-label="Captures webcam">
              {captures === null ? (
                <button type="button" className="btn-sm" onClick={() => void voirCaptures(detail.id)}>
                  Voir les captures webcam
                </button>
              ) : captures.captures.length === 0 ? (
                <p className="field-hint">Aucune capture webcam pour cette tentative.</p>
              ) : (
                <>
                  <p className="field-hint">
                    {captures.captures.length} capture(s)
                    {captures.consentementLe
                      ? ` · consentement donné le ${dateHeureFr(captures.consentementLe)}`
                      : ''}{' '}
                    · supprimées {captures.conservationJours} jours après la prise. Aucune analyse
                    automatique : à consulter seulement en cas de doute.
                  </p>
                  <div className="captures-grille">
                    {captures.captures.map((c) => (
                      <figure key={c.id}>
                        {images[c.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={images[c.id]} alt={`Capture du ${dateHeureFr(c.priseLe)}`} />
                        ) : null}
                        <figcaption>{dateHeureFr(c.priseLe)}</figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {erreurCaptures !== null && <p className="alert alert-error">{erreurCaptures}</p>}
            </section>
            <ol className="historique-questions">
              {detail.questions.map((q) => (
                <li key={q.id}>
                  <p className="historique-enonce">
                    {q.enonce}{' '}
                    <span className={q.estCorrecte ? 'historique-juste' : 'historique-faux'}>
                      {q.repondue ? (q.estCorrecte ? 'Juste' : 'Faux') : 'Sans réponse'} ·{' '}
                      {pointsFr(q.pointsObtenus, q.ponderation)}
                    </span>
                  </p>
                  <ul className="historique-options">
                    {q.options.map((o) => (
                      <li
                        key={o.id}
                        className={`${o.cochee ? 'historique-cochee' : ''} ${o.estCorrecte ? 'historique-bonne' : ''}`.trim() || undefined}
                      >
                        <span aria-hidden="true">{o.cochee ? '☑' : '☐'}</span> {o.texte}
                        {o.estCorrecte && <span className="historique-marque"> ✓ bonne réponse</span>}
                        {o.cochee && <span className="sr-only"> (cochée)</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}

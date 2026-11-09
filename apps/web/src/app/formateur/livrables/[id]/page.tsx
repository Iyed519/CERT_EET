'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminError,
  CritereGrille,
  getLivrableACorriger,
  LivrableACorriger,
  NoteCritere,
  noterCritere,
  ouvrirCorrection,
  telechargerFichierLivrable,
} from '../../../../lib/api';
import {
  dateHeureFr,
  LIBELLES_LIVRABLE_FORMATEUR,
  nomApprenantFr,
  nombreFr,
  tailleFr,
} from '../../../../lib/format';

/** Saisie en cours d'un critère (les points restent un texte tant qu'on tape). */
interface Brouillon {
  niveau: number | null;
  points: string;
  commentaire: string;
}

/** État de l'enregistrement d'un critère. */
type Etat = { type: 'enregistrement' } | { type: 'erreur'; message: string } | null;

const brouillonDe = (note: NoteCritere | undefined): Brouillon => ({
  niveau: note?.niveau ?? null,
  points: note ? nombreFr(note.pointsPct) : '',
  commentaire: note?.commentaire ?? '',
});

/** Points saisis valides pour le niveau choisi, sinon null. */
const pointsValides = (critere: CritereGrille, b: Brouillon): number | null => {
  const niveau = critere.niveaux.find((n) => n.ordre === b.niveau);
  const texte = b.points.trim().replace(',', '.');
  if (!niveau || texte === '' || !/^\d+(\.\d{1,2})?$/.test(texte)) return null;
  const points = Number(texte);
  return points >= niveau.pointsMinPct && points <= niveau.pointsMaxPct ? points : null;
};

const arrondi = (v: number): number => Math.round(v * 100) / 100;

/**
 * US-ATEL-06 — Correction d'un livrable critère par critère (UC5 Formateur,
 * DS-03 partie 2, AC-03).
 *
 * En haut, le livrable : fichiers à télécharger (avec leur SHA-256), hash de
 * traçabilité, commentaire et liens de l'apprenant. Puis la grille : pour
 * chaque critère, le niveau atteint, les points DANS la plage de ce niveau
 * (en % du critère), un commentaire, et « Enregistrer ». Le score pondéré
 * (Σ points × pondération / 100, sur 100) se recalcule en temps réel avec la
 * saisie ; le serveur le confirme à chaque enregistrement.
 * Tant que la correction n'est pas ouverte, la page propose de l'ouvrir.
 */
export default function CorrectionLivrablePage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const livrableId = params?.id ?? '';
  const [livrable, setLivrable] = useState<LivrableACorriger | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [ouverture, setOuverture] = useState(false);
  const [telechargement, setTelechargement] = useState<number | null>(null);

  const appliquer = useCallback((l: LivrableACorriger): void => {
    setLivrable(l);
    const notes = new Map((l.correction?.notes ?? []).map((n) => [n.critereId, n]));
    setBrouillons(Object.fromEntries(l.criteres.map((c) => [c.id, brouillonDe(notes.get(c.id))])));
    setEtats({});
  }, []);

  const charger = useCallback(async (): Promise<void> => {
    if (!livrableId) return;
    setErreur(null);
    try {
      appliquer(await getLivrableACorriger(livrableId));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger le livrable.');
    } finally {
      setChargement(false);
    }
  }, [livrableId, appliquer]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const notesEnregistrees = useMemo(
    () => new Map((livrable?.correction?.notes ?? []).map((n) => [n.critereId, n])),
    [livrable],
  );
  const modifiable = livrable?.statut === 'EN_CORRECTION';

  /** Score en temps réel : la saisie valide, sinon la note enregistrée. */
  const scoreDirect = useMemo(() => {
    if (!livrable) return { score: 0, notes: 0 };
    let score = 0;
    let notes = 0;
    for (const c of livrable.criteres) {
      const b = brouillons[c.id];
      const points = b ? pointsValides(c, b) : null;
      const retenus = points ?? notesEnregistrees.get(c.id)?.pointsPct ?? null;
      if (retenus !== null) {
        score += (retenus * c.ponderation) / 100;
        notes += 1;
      }
    }
    return { score: arrondi(score), notes };
  }, [livrable, brouillons, notesEnregistrees]);

  const modifier = (critereId: string, maj: Partial<Brouillon>): void => {
    setBrouillons((prec) => ({ ...prec, [critereId]: { ...prec[critereId], ...maj } }));
    setEtats((prec) => ({ ...prec, [critereId]: null }));
  };

  const choisirNiveau = (critere: CritereGrille, ordre: number): void => {
    const niveau = critere.niveaux.find((n) => n.ordre === ordre);
    if (!niveau) return;
    const b = brouillons[critere.id];
    const actuels = pointsValides(critere, { ...b, niveau: ordre });
    modifier(critere.id, {
      niveau: ordre,
      points:
        actuels !== null ? b.points : nombreFr((niveau.pointsMinPct + niveau.pointsMaxPct) / 2),
    });
  };

  const enregistrer = async (critere: CritereGrille): Promise<void> => {
    if (!livrable) return;
    const b = brouillons[critere.id];
    const points = pointsValides(critere, b);
    if (b.niveau === null || points === null) {
      const niveau = critere.niveaux.find((n) => n.ordre === b.niveau);
      setEtats((prec) => ({
        ...prec,
        [critere.id]: {
          type: 'erreur',
          message: niveau
            ? `Points attendus entre ${niveau.pointsMinPct} et ${niveau.pointsMaxPct} % (deux décimales au plus).`
            : 'Choisissez d’abord le niveau atteint.',
        },
      }));
      return;
    }
    setEtats((prec) => ({ ...prec, [critere.id]: { type: 'enregistrement' } }));
    try {
      const res = await noterCritere(livrable.id, critere.id, {
        niveau: b.niveau,
        pointsPct: points,
        commentaire: b.commentaire.trim() === '' ? null : b.commentaire,
      });
      setLivrable((prec) => {
        if (!prec?.correction) return prec;
        const autres = prec.correction.notes.filter((n) => n.critereId !== critere.id);
        return {
          ...prec,
          correction: {
            ...prec.correction,
            notes: [...autres, res.note],
            scoreActuel: res.scoreActuel,
            avancement: res.avancement,
          },
        };
      });
      setBrouillons((prec) => ({ ...prec, [critere.id]: brouillonDe(res.note) }));
      setEtats((prec) => ({ ...prec, [critere.id]: null }));
    } catch (error) {
      setEtats((prec) => ({
        ...prec,
        [critere.id]: {
          type: 'erreur',
          message: error instanceof AdminError ? error.message : 'Impossible d’enregistrer la note.',
        },
      }));
    }
  };

  const ouvrir = async (): Promise<void> => {
    if (!livrable) return;
    setErreur(null);
    setOuverture(true);
    try {
      appliquer(await ouvrirCorrection(livrable.id));
    } catch (error) {
      // Rechargée d'abord (ouverte ailleurs entre-temps), puis le refus :
      // charger() efface le message précédent.
      await charger();
      setErreur(error instanceof AdminError ? error.message : 'Impossible d’ouvrir la correction.');
    } finally {
      setOuverture(false);
    }
  };

  const telecharger = async (ordre: number, nom: string): Promise<void> => {
    if (!livrable) return;
    setErreur(null);
    setTelechargement(ordre);
    try {
      await telechargerFichierLivrable(livrable.id, ordre, nom);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de télécharger le fichier.');
    } finally {
      setTelechargement(null);
    }
  };

  const modifie = (c: CritereGrille): boolean => {
    const b = brouillons[c.id];
    const n = notesEnregistrees.get(c.id);
    if (!b) return false;
    if (!n) return b.niveau !== null || b.points.trim() !== '' || b.commentaire.trim() !== '';
    return (
      b.niveau !== n.niveau ||
      pointsValides(c, b) !== n.pointsPct ||
      b.commentaire.trim() !== (n.commentaire ?? '')
    );
  };

  const avancement = livrable?.correction?.avancement;
  const total = livrable?.criteres.length ?? 0;

  return (
    <>
      {livrable && (
        <p className="back-link-row">
          <Link className="back-link" href={`/formateur/ateliers/${livrable.atelier.id}`}>
            ← Retour à l’atelier
          </Link>
        </p>
      )}

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : livrable === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">Correction — {nomApprenantFr(livrable.apprenant)}</h1>
              <p className="page-subtitle">
                Atelier « {livrable.atelier.titre} » · {livrable.atelier.formationTitre}
              </p>
            </div>
            <span className={`statut-badge livrable-formateur-${livrable.statut}`}>
              {LIBELLES_LIVRABLE_FORMATEUR[livrable.statut]}
            </span>
          </div>

          {livrable.statut === 'SOUMIS' && (
            <div className="alert alert-info correction-ouvrir">
              <span>
                Ouvrez la correction pour noter ce livrable : l’apprenant ne pourra plus le
                modifier.
              </span>
              <button
                type="button"
                className="btn-sm btn-primary-sm"
                onClick={() => void ouvrir()}
                disabled={ouverture}
              >
                {ouverture ? 'Ouverture…' : 'Ouvrir la correction'}
              </button>
            </div>
          )}

          <section className="mon-livrable correction-livrable" aria-labelledby="titre-livrable">
            <h2 id="titre-livrable" className="section-title">
              Livrable
            </h2>
            <p className="field-hint">
              {livrable.apprenant.email} · version {livrable.version} · déposé le{' '}
              {dateHeureFr(livrable.dateSoumission)}
              {livrable.enRetard ? ' · en retard (pendant la tolérance)' : ''}
            </p>
            <ul className="depot-fichiers">
              {livrable.fichiers.map((f) => (
                <li key={f.ordre} className="depot-fichier">
                  <span className="depot-fichier-nom">{f.nomOriginal}</span>
                  <span className="field-hint">{tailleFr(f.tailleOctets)}</span>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => void telecharger(f.ordre, f.nomOriginal)}
                    disabled={telechargement !== null}
                  >
                    {telechargement === f.ordre ? 'Téléchargement…' : 'Télécharger'}
                  </button>
                  <code className="empreinte" title="SHA-256 du fichier">
                    {f.sha256}
                  </code>
                </li>
              ))}
            </ul>
            <dl className="fiche mon-livrable-fiche">
              <div className="fiche-large">
                <dt>Hash de traçabilité (SHA-256)</dt>
                <dd>
                  <code className="empreinte">{livrable.hashTracabilite}</code>
                </dd>
              </div>
              {livrable.commentaire && (
                <div className="fiche-large">
                  <dt>Commentaire de l’apprenant</dt>
                  <dd className="texte-libre">{livrable.commentaire}</dd>
                </div>
              )}
              {livrable.liens.length > 0 && (
                <div className="fiche-large">
                  <dt>Liens</dt>
                  <dd>
                    {livrable.liens.map((l) => (
                      <a
                        key={l}
                        className="table-link lien-externe"
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {l}
                      </a>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {livrable.correction && (
            <div className="score-correction" aria-live="polite">
              <div className="score-correction-valeur">
                <span className="score-correction-libelle">Score pondéré</span>
                <strong>{nombreFr(scoreDirect.score)}</strong>
                <span className="score-correction-sur">/ 100</span>
              </div>
              <div className="score-correction-detail">
                <span>
                  {scoreDirect.notes}/{total} critère{total > 1 ? 's' : ''} noté
                  {total > 1 ? 's' : ''}
                </span>
                <span className="field-hint">
                  Enregistré : {nombreFr(livrable.correction.scoreActuel)} / 100 ·{' '}
                  {avancement?.notes ?? 0}/{avancement?.total ?? total}
                </span>
              </div>
              <div className="total-barre-piste">
                <div
                  className="total-barre-remplie score-correction-remplie"
                  style={{ width: `${Math.min(100, scoreDirect.score)}%` }}
                />
              </div>
            </div>
          )}

          <h2 className="section-title">Grille de notation</h2>
          {!modifiable && livrable.correction && (
            <p className="alert alert-info">Ce livrable est noté : la correction ne se modifie plus.</p>
          )}
          <ol className="criteres">
            {livrable.criteres.map((c) => {
              const b = brouillons[c.id] ?? brouillonDe(undefined);
              const etat = etats[c.id] ?? null;
              const points = pointsValides(c, b);
              const niveauChoisi = c.niveaux.find((n) => n.ordre === b.niveau);
              const enregistree = notesEnregistrees.get(c.id);
              const aEnregistrer = modifie(c);
              const actif = modifiable && etat?.type !== 'enregistrement';
              return (
                <li key={c.id} className="critere critere-correction">
                  <div className="critere-tete">
                    <span className="module-ordre">{c.ordre}</span>
                    <div className="module-corps">
                      <p className="critere-intitule">
                        {c.intitule} <span className="critere-poids">{c.ponderation} %</span>
                      </p>
                      {c.description && <p className="critere-description">{c.description}</p>}
                    </div>
                    <span className="critere-contribution">
                      {points !== null || enregistree
                        ? `${nombreFr(arrondi(((points ?? enregistree?.pointsPct ?? 0) * c.ponderation) / 100))} / ${c.ponderation} pts`
                        : `— / ${c.ponderation} pts`}
                    </span>
                  </div>

                  {livrable.correction ? (
                    <>
                      <div className="niveaux-choix" role="radiogroup" aria-label={`Niveau — ${c.intitule}`}>
                        {c.niveaux.map((n) => (
                          <button
                            key={n.ordre}
                            type="button"
                            role="radio"
                            aria-checked={b.niveau === n.ordre}
                            className={`niveau niveau-${n.ordre} niveau-choix${b.niveau === n.ordre ? ' niveau-choisi' : ''}`}
                            onClick={() => choisirNiveau(c, n.ordre)}
                            disabled={!actif}
                          >
                            <span className="niveau-libelle">{n.libelle}</span>
                            <span className="niveau-plage">
                              {n.pointsMinPct}–{n.pointsMaxPct} %
                            </span>
                            {n.descripteur && <span className="niveau-descripteur">{n.descripteur}</span>}
                          </button>
                        ))}
                      </div>
                      <div className="note-saisie">
                        <label className="field note-points">
                          <span className="field-label">Points (% du critère)</span>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={b.points}
                            onChange={(e) => modifier(c.id, { points: e.target.value })}
                            placeholder={
                              niveauChoisi
                                ? `${niveauChoisi.pointsMinPct} à ${niveauChoisi.pointsMaxPct}`
                                : 'Niveau d’abord'
                            }
                            disabled={!actif || b.niveau === null}
                            aria-invalid={b.points.trim() !== '' && points === null}
                          />
                        </label>
                        <label className="field note-commentaire">
                          <span className="field-label">Commentaire (facultatif)</span>
                          <textarea
                            className="input depot-commentaire"
                            rows={2}
                            maxLength={2000}
                            value={b.commentaire}
                            onChange={(e) => modifier(c.id, { commentaire: e.target.value })}
                            disabled={!actif}
                          />
                        </label>
                      </div>
                      <div className="note-pied">
                        <span
                          className={`field-hint${etat?.type === 'erreur' ? ' texte-erreur' : ''}`}
                          role={etat?.type === 'erreur' ? 'alert' : undefined}
                        >
                          {etat?.type === 'erreur'
                            ? etat.message
                            : etat?.type === 'enregistrement'
                              ? 'Enregistrement…'
                              : aEnregistrer
                                ? 'Modifié — pas encore enregistré.'
                                : enregistree
                                  ? `Enregistré : ${enregistree.libelleNiveau}, ${nombreFr(enregistree.pointsPct)} %.`
                                  : 'Pas encore noté.'}
                        </span>
                        {modifiable && (
                          <button
                            type="button"
                            className="btn-sm btn-primary-sm"
                            onClick={() => void enregistrer(c)}
                            disabled={!actif || !aEnregistrer}
                          >
                            Enregistrer
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <ul className="niveaux">
                      {c.niveaux.map((n) => (
                        <li key={n.ordre} className={`niveau niveau-${n.ordre}`}>
                          <span className="niveau-libelle">{n.libelle}</span>
                          <span className="niveau-plage">
                            {n.pointsMinPct}–{n.pointsMaxPct} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}

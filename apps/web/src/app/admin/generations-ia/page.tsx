'use client';
import { useCallback, useEffect, useState } from 'react';
import { EtatVide } from '../../../components/EtatVide';
import {
  AdminError,
  DetailGenerationTracee,
  GenerationTracee,
  getGenerationIa,
  getGenerationsIa,
  PersonneTracee,
} from '../../../lib/api';
import { dateHeureFr } from '../../../lib/format';
import { useCompteurs } from '../../../lib/useCompteurs';
import { ActionsLigne } from '../../../components/ActionsLigne';
import { BarreListe } from '../../../components/BarreListe';
import { EnTetePage } from '../../../components/EnTetePage';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { PaginationListe } from '../../../components/PaginationListe';
import { PastilleStatut } from '../../../components/PastilleStatut';

const STATUTS_GENERATION: Record<GenerationTracee['statut'], string> = {
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ECHEC: 'Échec',
};
const STATUTS_FILTRE = Object.keys(STATUTS_GENERATION) as Array<GenerationTracee['statut']>;
const STATUTS_COMPTES: Array<GenerationTracee['statut'] | 'TOUS'> = ['TOUS', ...STATUTS_FILTRE];
const STATUTS_SUGGESTION: Record<string, string> = {
  PROPOSEE: 'En attente',
  ACCEPTEE: 'Acceptée',
  MODIFIEE: 'Acceptée après modification',
  REJETEE: 'Rejetée',
};
const ORIGINES: Record<string, string> = {
  IA: 'origine IA',
  IA_MODIFIEE: 'origine IA (modifiée)',
  MANUELLE: 'manuelle',
};

const nom = (p: PersonneTracee | null): string =>
  p ? [p.prenom, p.nom].filter(Boolean).join(' ') || p.email : '—';

/** Une date « AAAA-MM-JJ » du champ date en borne ISO (début ou fin de journée, UTC). */
const borne = (jour: string, fin: boolean): string | undefined =>
  jour ? `${jour}T${fin ? '23:59:59.999' : '00:00:00.000'}Z` : undefined;

/**
 * US-IA-05 — Registre des générations IA (administrateur) : qui a lancé
 * quoi, avec quel modèle et quels paramètres, quand, avec quel résultat ;
 * le détail donne chaque décision (auteur, date, motif), la question créée
 * avec son origine IA, et l'historique d'audit. Lecture seule.
 */
export default function GenerationsIaPage(): JSX.Element {
  const [statut, setStatut] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState<{ total: number; limite: number; generations: GenerationTracee[] } | null>(null);
  const [detail, setDetail] = useState<DetailGenerationTracee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // US-UX-07 : compteurs des pastilles (même période), relus après chaque chargement.
  const [version, setVersion] = useState(0);
  const compteurs = useCompteurs(
    STATUTS_COMPTES,
    async (s) =>
      (await getGenerationsIa({ statut: s === 'TOUS' ? undefined : s, du: borne(du, false), au: borne(au, true) })).total,
    version,
  );

  const charger = useCallback(async (): Promise<void> => {
    setErreur(null);
    try {
      setDonnees(
        await getGenerationsIa({
          statut: statut || undefined,
          du: borne(du, false),
          au: borne(au, true),
          page,
        }),
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les générations IA.');
    }
  }, [statut, du, au, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvrir = async (id: string): Promise<void> => {
    setErreur(null);
    try {
      setDetail(await getGenerationIa(id));
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger cette génération.');
    }
  };

  const pages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.limite)) : 1;

  return (
    <>
      <EnTetePage
        titre="Générations IA"
        phrase="Registre complet des générations de questions par IA et des décisions des formateurs."
      />

      <BarreListe
        filtres={
          <>
            <FiltresPastilles<string>
              libelle="Filtrer par statut"
              valeur={statut}
              onChange={(v) => {
                setPage(1);
                setStatut(v);
              }}
              options={[
                { valeur: '', libelle: 'Tous', compteur: compteurs.TOUS },
                ...STATUTS_FILTRE.map((v) => ({ valeur: v, libelle: STATUTS_GENERATION[v], compteur: compteurs[v] })),
              ]}
            />
            <div className="barre-liste-periode">
              <label className="field-label" htmlFor="gen-du">
                Du
                <input id="gen-du" className="input" type="date" value={du} onChange={(e) => { setPage(1); setDu(e.target.value); }} />
              </label>
              <label className="field-label" htmlFor="gen-au">
                Au
                <input id="gen-au" className="input" type="date" value={au} onChange={(e) => { setPage(1); setAu(e.target.value); }} />
              </label>
            </div>
          </>
        }
        onActualiser={() => void charger()}
      />

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {donnees === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : donnees.generations.length === 0 ? (
        <EtatVide
          titre="Aucune génération"
          texte="Aucune génération de questions par l’IA ne correspond à ces critères. Élargissez la période ou retirez un filtre."
        />
      ) : (
        <>
          <div className="table-wrap table-wrap-compacte">
            <table className="data-table table-compacte liste-admin">
              <thead>
                <tr>
                  <th>Formation · module</th>
                  <th>Lancée le</th>
                  <th>Formateur</th>
                  <th>Modèle</th>
                  <th>Statut</th>
                  <th>Décisions</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {donnees.generations.map((g) => (
                  <tr key={g.id}>
                    <th scope="row">
                      <button type="button" className="ligne-ouvrir lien-bouton" onClick={() => void ouvrir(g.id)}>
                        {g.formation.titre}
                      </button>
                      <span className="field-hint">
                        {g.module.titre} · {g.support.titre}
                      </span>
                    </th>
                    <td data-libelle="Lancée le">{dateHeureFr(g.dateLancement)}</td>
                    <td data-libelle="Formateur">{nom(g.formateur)}</td>
                    <td data-libelle="Modèle">{g.modeleLlm ?? '—'}</td>
                    <td data-libelle="Statut">
                      <PastilleStatut statut={g.statut} libelle={STATUTS_GENERATION[g.statut]} />
                    </td>
                    <td data-libelle="Décisions">
                      {g.decisions.acceptees + g.decisions.modifiees} acceptée(s) · {g.decisions.rejetees} rejetée(s) ·{' '}
                      {g.decisions.proposees} en attente
                    </td>
                    <td className="liste-admin-actions">
                      <ActionsLigne
                        contexte={g.formation.titre}
                        principale={{ libelle: 'Détail', icone: 'ouvrir', onClick: () => void ouvrir(g.id) }}
                        autres={[]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationListe page={page} pages={pages} total={donnees.total} unite={['génération', 'générations']} onPage={setPage} />
        </>
      )}

      {detail && (
        <div className="profil-overlay" role="dialog" aria-modal="true">
          <section className="profil-card modal-closable modal-wide">
            <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setDetail(null)}>
              ×
            </button>
            <h2 className="auth-title">Génération du {dateHeureFr(detail.dateLancement)}</h2>
            <dl className="fiche">
              <div>
                <dt>Formateur</dt>
                <dd>{nom(detail.formateur)}</dd>
              </div>
              <div>
                <dt>Formation · module</dt>
                <dd>
                  {detail.formation.titre} · {detail.module.titre}
                </dd>
              </div>
              <div>
                <dt>Support</dt>
                <dd>{detail.support.titre}</dd>
              </div>
              <div>
                <dt>Modèle</dt>
                <dd>{detail.modeleLlm ?? '—'}</dd>
              </div>
              <div>
                <dt>Paramètres</dt>
                <dd>
                  {detail.parametres.nbQuestionsDemandees} question(s) · {detail.parametres.types.join(', ')} ·{' '}
                  {detail.parametres.niveau}
                  {detail.parametres.focusThematique ? ` · « ${detail.parametres.focusThematique} »` : ''}
                </dd>
              </div>
              <div>
                <dt>Résultat</dt>
                <dd>
                  {STATUTS_GENERATION[detail.statut]}
                  {detail.nbSuggestions !== null ? ` · ${detail.nbSuggestions} suggestion(s)` : ''}
                  {detail.nbInvalides ? ` · ${detail.nbInvalides} écartée(s)` : ''}
                  {detail.derniereErreur ? ` · ${detail.derniereErreur}` : ''}
                </dd>
              </div>
            </dl>
            <h3 className="section-title">Suggestions et décisions</h3>
            <ol className="historique-questions">
              {detail.suggestions.map((s) => (
                <li key={s.id}>
                  <p className="historique-enonce">{s.enonce}</p>
                  <p className="field-hint">
                    {STATUTS_SUGGESTION[s.statut] ?? s.statut}
                    {s.decidePar ? ` par ${nom(s.decidePar)}` : ''}
                    {s.dateDecision ? ` le ${dateHeureFr(s.dateDecision)}` : ''}
                    {s.motifRejet ? ` — motif : ${s.motifRejet}` : ''}
                    {s.question ? ` · question ${ORIGINES[s.question.origine] ?? s.question.origine}` : ''}
                    {s.qcm ? ` dans « ${s.qcm.titre} »` : ''}
                  </p>
                </li>
              ))}
            </ol>
            <h3 className="section-title">Historique</h3>
            <ul className="historique-options">
              {detail.historique.map((h, i) => (
                <li key={`${h.action}-${i}`}>
                  {dateHeureFr(h.horodatage)} · {h.action} · {nom(h.acteur)} · {h.resultat}
                </li>
              ))}
              {detail.historique.length === 0 && <li>Aucune trace.</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

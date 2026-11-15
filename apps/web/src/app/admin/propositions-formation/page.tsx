'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CroixFermeture } from '../../../components/CroixFermeture';
import {
  AdminError,
  deciderProposition,
  getAdminPropositions,
  PropositionFormationAdmin,
  StatutProposition,
} from '../../../lib/api';
import { dateHeureFr, LIBELLES_STATUT_DEMANDE_FORMATEUR } from '../../../lib/format';
import { ActionsLigne } from '../../../components/ActionsLigne';
import { BarreListe } from '../../../components/BarreListe';
import { EnTetePage } from '../../../components/EnTetePage';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { useCompteurs } from '../../../lib/useCompteurs';

const FILTRES: StatutProposition[] = ['EN_ATTENTE', 'A_MODIFIER', 'ACCEPTEE', 'REFUSEE'];
/** US-UX-07 — nombre de propositions d'un statut (appel existant, total seul). */
const totalPropositions = async (statut: StatutProposition): Promise<number> =>
  (await getAdminPropositions({ statut, limit: 1 })).total;
const TEXTE_MIN = 10;
const TEXTE_MAX = 1000;

const nomDe = (f: PropositionFormationAdmin['formateur']): string =>
  [f.prenom, f.nom].filter(Boolean).join(' ') || f.email;

type Action = 'demander-modifications' | 'refuser';

/**
 * US-FORM-08 — Propositions de formation des formateurs (ADMINISTRATEUR) :
 * accepter (formation créée en brouillon, proposant affecté — à publier depuis
 * « Formations »), demander des modifications (commentaire) ou refuser (motif).
 */
export default function AdminPropositionsPage(): JSX.Element {
  const [filtre, setFiltre] = useState<StatutProposition>('EN_ATTENTE');
  const [propositions, setPropositions] = useState<PropositionFormationAdmin[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ p: PropositionFormationAdmin; action: Action } | null>(null);
  // US-UX-07 : compteurs des pastilles, relus après chaque chargement.
  const [version, setVersion] = useState(0);
  const compteurs = useCompteurs(FILTRES, totalPropositions, version);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setPropositions((await getAdminPropositions({ statut: filtre, limit: 100 })).items);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les propositions.');
    } finally {
      setChargement(false);
    }
  }, [filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function accepter(p: PropositionFormationAdmin): Promise<void> {
    setEnCours(p.id);
    setErreur(null);
    setSucces(null);
    try {
      await deciderProposition(p.id, 'accepter');
      setSucces(
        `« ${p.titre} » est créée en brouillon, ${nomDe(p.formateur)} y est affecté. Publiez-la depuis « Formations » quand elle est prête.`,
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible d’accepter la proposition.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <>
      <EnTetePage
        titre="Propositions de formation"
        phrase="Des formateurs proposent de nouvelles formations. Accepter crée la formation en brouillon avec le proposant affecté."
      />

      <BarreListe
        filtres={
          <FiltresPastilles<StatutProposition>
            libelle="Filtrer par statut"
            valeur={filtre}
            onChange={setFiltre}
            options={FILTRES.map((s) => ({ valeur: s, libelle: LIBELLES_STATUT_DEMANDE_FORMATEUR[s], compteur: compteurs[s] }))}
          />
        }
        onActualiser={() => void charger()}
        actualisation={chargement}
      />

      {succes && <p className="alert alert-success">{succes}</p>}
      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <div className="table-wrap table-wrap-compacte">
          <table className="data-table table-compacte liste-admin">
            <thead>
              <tr>
                <th>Proposition</th>
                <th>Statut</th>
                <th>Formateur</th>
                <th>Détails</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {propositions.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <strong>{p.titre}</strong>
                    <div className="muted-cell">
                      {dateHeureFr(p.modifieLe)}
                      {p.version > 1 ? ` · version ${p.version}` : ''}
                    </div>
                  </th>
                  <td data-libelle="Statut">
                    <PastilleStatut statut={p.statut} libelle={LIBELLES_STATUT_DEMANDE_FORMATEUR[p.statut]} />
                    {p.commentaireAdmin && p.statut !== 'ACCEPTEE' && (
                      <div className="field-hint proposition-details">{p.commentaireAdmin}</div>
                    )}
                  </td>
                  <td data-libelle="Formateur">
                    <div>{nomDe(p.formateur)}</div>
                    <div className="muted-cell">{p.formateur.email}</div>
                  </td>
                  <td data-libelle="Détails" className="proposition-details">
                    {[
                      p.dureeHeures ? `${p.dureeHeures} h` : null,
                      `${p.capaciteMax} places`,
                      p.publicVise ? `Public : ${p.publicVise}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {p.description && <div>{p.description}</div>}
                    {p.objectifs && <div>Objectifs : {p.objectifs}</div>}
                    <div>Motif : {p.motif}</div>
                  </td>
                  <td className="liste-admin-actions">
                    {p.statut === 'EN_ATTENTE' ? (
                      <ActionsLigne
                        contexte={p.titre}
                        principale={{
                          libelle: enCours === p.id ? 'Création…' : 'Accepter',
                          icone: 'succes',
                          desactive: enCours === p.id,
                          onClick: () => void accepter(p),
                        }}
                        autres={[
                          {
                            libelle: 'Demander des modifications',
                            icone: 'modifier',
                            desactive: enCours === p.id,
                            onClick: () => setDialogue({ p, action: 'demander-modifications' }),
                          },
                          {
                            libelle: 'Refuser',
                            icone: 'erreur',
                            danger: true,
                            separe: true,
                            desactive: enCours === p.id,
                            onClick: () => setDialogue({ p, action: 'refuser' }),
                          },
                        ]}
                      />
                    ) : p.statut === 'ACCEPTEE' && p.formationId ? (
                      <Link className="btn-sm btn-lien" href="/admin/formations">
                        <Icone nom="formation" taille={16} />
                        Voir les formations
                      </Link>
                    ) : (
                      <span className="muted-cell">{p.traiteLe ? dateHeureFr(p.traiteLe) : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {propositions.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted-cell">
                    Aucune proposition « {LIBELLES_STATUT_DEMANDE_FORMATEUR[filtre].toLowerCase()} ».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialogue && (
        <CommentaireModal
          proposition={dialogue.p}
          action={dialogue.action}
          onClose={() => setDialogue(null)}
          onDone={(message) => {
            setDialogue(null);
            setSucces(message);
            void charger();
          }}
        />
      )}
    </>
  );
}

function CommentaireModal({
  proposition,
  action,
  onClose,
  onDone,
}: {
  proposition: PropositionFormationAdmin;
  action: Action;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const refus = action === 'refuser';
  const longueur = texte.trim().length;

  async function valider(e: FormEvent): Promise<void> {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await deciderProposition(proposition.id, action, texte.trim());
      onDone(refus ? `Proposition « ${proposition.titre} » refusée.` : `Modifications demandées pour « ${proposition.titre} ».`);
    } catch (err) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible d’enregistrer la décision.');
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-decision">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title" id="titre-decision">
          {refus ? 'Refuser la proposition' : 'Demander des modifications'}
        </h2>
        <p className="auth-subtitle">
          « {proposition.titre} » — {nomDe(proposition.formateur)}
        </p>
        <form className="form" onSubmit={(e) => void valider(e)}>
          <label className="field">
            <span className="field-label">{refus ? 'Motif du refus' : 'Modifications attendues'}</span>
            <textarea
              className="input"
              rows={4}
              maxLength={TEXTE_MAX}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              disabled={enCours}
              required
            />
            <span className="field-hint">
              Obligatoire ({TEXTE_MIN} à {TEXTE_MAX} caractères) : envoyé au formateur par email.
            </span>
          </label>
          {erreur && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-danger-solid" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={enCours || longueur < TEXTE_MIN || longueur > TEXTE_MAX}>
              {enCours ? 'Envoi…' : refus ? 'Refuser' : 'Envoyer la demande'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

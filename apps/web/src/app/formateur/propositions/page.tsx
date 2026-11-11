'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  enregistrerProposition,
  getMesPropositions,
  PropositionFormation,
} from '../../../lib/api';
import { jourFr, LIBELLES_STATUT_DEMANDE_FORMATEUR } from '../../../lib/format';

const MOTIF_MIN = 10;
const MAX_OUVERTES = 5;

interface Saisie {
  titre: string;
  description: string;
  objectifs: string;
  dureeHeures: string;
  capaciteMax: string;
  publicVise: string;
  motif: string;
}

const VIDE: Saisie = {
  titre: '',
  description: '',
  objectifs: '',
  dureeHeures: '',
  capaciteMax: '20',
  publicVise: '',
  motif: '',
};

const depuis = (p: PropositionFormation): Saisie => ({
  titre: p.titre,
  description: p.description ?? '',
  objectifs: p.objectifs ?? '',
  dureeHeures: p.dureeHeures === null ? '' : String(p.dureeHeures),
  capaciteMax: String(p.capaciteMax),
  publicVise: p.publicVise ?? '',
  motif: p.motif,
});

/**
 * US-FORM-08 — Proposer une nouvelle formation (plusieurs possibles, au plus
 * 5 en cours), suivre ses propositions, modifier et renvoyer celles où
 * l'administrateur demande des modifications. Une proposition acceptée
 * devient une formation en brouillon où le formateur est affecté.
 */
export default function MesPropositionsPage(): JSX.Element {
  const [propositions, setPropositions] = useState<PropositionFormation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(VIDE);
  const [enEdition, setEnEdition] = useState<PropositionFormation | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    try {
      setPropositions(await getMesPropositions());
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger vos propositions.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvertes = propositions.filter((p) => p.statut === 'EN_ATTENTE' || p.statut === 'A_MODIFIER').length;
  const limiteAtteinte = !enEdition && ouvertes >= MAX_OUVERTES;
  const pret =
    saisie.titre.trim().length > 0 &&
    Number(saisie.capaciteMax) >= 1 &&
    saisie.motif.trim().length >= MOTIF_MIN &&
    !limiteAtteinte;

  const champ = (cle: keyof Saisie) => ({
    value: saisie[cle],
    onChange: (e: { target: { value: string } }) => setSaisie((s) => ({ ...s, [cle]: e.target.value })),
    disabled: envoi,
  });

  function modifier(p: PropositionFormation): void {
    setEnEdition(p);
    setSaisie(depuis(p));
    setSucces(null);
    setErreur(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function annulerEdition(): void {
    setEnEdition(null);
    setSaisie(VIDE);
  }

  async function envoyer(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!pret) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    try {
      const p = await enregistrerProposition(
        {
          titre: saisie.titre.trim(),
          description: saisie.description.trim() || undefined,
          objectifs: saisie.objectifs.trim() || undefined,
          dureeHeures: saisie.dureeHeures ? Number(saisie.dureeHeures) : undefined,
          capaciteMax: Number(saisie.capaciteMax),
          publicVise: saisie.publicVise.trim() || undefined,
          motif: saisie.motif.trim(),
        },
        enEdition?.id,
      );
      setSucces(
        enEdition
          ? `Proposition « ${p.titre} » modifiée et renvoyée à l’administrateur.`
          : `Proposition « ${p.titre} » envoyée. Un administrateur va l’examiner.`,
      );
      annulerEdition();
      await charger();
    } catch (err) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible d’enregistrer la proposition.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes propositions</h1>
          <p className="page-subtitle">
            Proposez une nouvelle formation. Acceptée, elle est créée en brouillon et vous y êtes
            affecté ; l’administrateur peut aussi demander des modifications.
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn-sm btn-link" href="/formateur/demandes">
            Mes demandes
          </Link>
          <Link className="btn-sm btn-link" href="/formateur/tableau-de-bord">
            Tableau de bord
          </Link>
        </div>
      </div>

      {succes && <p className="alert alert-success">{succes}</p>}
      {erreur && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}

      <section className="tdb-bloc" aria-labelledby="titre-proposer">
        <h2 id="titre-proposer">{enEdition ? 'Modifier et renvoyer' : 'Proposer une formation'}</h2>
        {enEdition?.commentaireAdmin && (
          <p className="alert alert-info">Demande de l’administrateur : {enEdition.commentaireAdmin}</p>
        )}
        {limiteAtteinte ? (
          <p className="kpi-sous">
            Vous avez déjà {MAX_OUVERTES} propositions en cours : attendez une décision avant d’en
            envoyer une autre.
          </p>
        ) : (
          <form className="demande-form" onSubmit={(e) => void envoyer(e)}>
            <label className="field">
              <span className="field-label">Titre</span>
              <input className="input" maxLength={255} required {...champ('titre')} />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea className="input" rows={3} maxLength={5000} {...champ('description')} />
            </label>
            <label className="field">
              <span className="field-label">Objectifs</span>
              <textarea className="input" rows={3} maxLength={5000} {...champ('objectifs')} />
            </label>
            <div className="proposition-grille">
              <label className="field">
                <span className="field-label">Durée (heures)</span>
                <input className="input" type="number" min={1} max={10000} {...champ('dureeHeures')} />
              </label>
              <label className="field">
                <span className="field-label">Capacité (apprenants)</span>
                <input className="input" type="number" min={1} max={100000} required {...champ('capaciteMax')} />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Public visé</span>
              <input className="input" maxLength={1000} {...champ('publicVise')} />
            </label>
            <label className="field">
              <span className="field-label">Motif</span>
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                placeholder="Pourquoi cette formation, pour qui, quel besoin…"
                required
                {...champ('motif')}
              />
              <span className="compteur-caracteres">
                {saisie.motif.trim().length} / 1000 (au moins {MOTIF_MIN})
              </span>
            </label>
            <div className="row-actions">
              <button className="btn" type="submit" disabled={!pret || envoi}>
                {envoi ? 'Envoi…' : enEdition ? 'Renvoyer la proposition' : 'Envoyer la proposition'}
              </button>
              {enEdition && (
                <button type="button" className="btn-sm btn-ghost" onClick={annulerEdition} disabled={envoi}>
                  Annuler la modification
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="tdb-bloc" aria-labelledby="titre-mes-propositions">
        <h2 id="titre-mes-propositions">Mes propositions ({ouvertes} en cours sur {MAX_OUVERTES})</h2>
        {!chargement && propositions.length === 0 ? (
          <p className="kpi-sous">Vous n’avez encore proposé aucune formation.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Formation proposée</th>
                  <th>Statut</th>
                  <th>Mise à jour</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {propositions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.titre}</strong>
                      <div className="proposition-details">
                        {[p.dureeHeures ? `${p.dureeHeures} h` : null, `${p.capaciteMax} places`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td>
                      <span className={`statut-badge statut-${p.statut}`}>
                        {LIBELLES_STATUT_DEMANDE_FORMATEUR[p.statut]}
                      </span>
                      {p.commentaireAdmin && p.statut !== 'ACCEPTEE' && (
                        <div className="field-hint proposition-details">
                          {p.statut === 'REFUSEE' ? 'Motif' : 'Commentaire'} : {p.commentaireAdmin}
                        </div>
                      )}
                    </td>
                    <td>{jourFr(p.modifieLe)}</td>
                    <td>
                      {p.statut === 'ACCEPTEE' && p.formationId ? (
                        <Link className="btn-sm btn-link" href={`/formateur/formations/${p.formationId}`}>
                          Ouvrir la formation
                        </Link>
                      ) : p.statut === 'A_MODIFIER' || p.statut === 'EN_ATTENTE' ? (
                        <button className="btn-sm" onClick={() => modifier(p)}>
                          {p.statut === 'A_MODIFIER' ? 'Modifier et renvoyer' : 'Modifier'}
                        </button>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

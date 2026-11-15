'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminError, getMesRapports, Rapport, telechargerRapport } from '../lib/api';
import { dateHeureFr } from '../lib/format';
import { EtatVide } from './EtatVide';
import { Icone } from './Icone';
import { PastilleStatut } from './PastilleStatut';

const STATUTS: Record<Rapport['statut'], string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'En cours',
  PRET: 'Prêt',
  ECHEC: 'Échec',
};

const PORTEES: Record<string, string> = {
  GLOBAL: 'Vue globale',
  INDIVIDUEL: 'Un apprenant',
  MODULE: 'Par module',
  // US-RPT-02 — modèles institutionnels.
  SYNTHESE: 'Synthèse de la plateforme',
  FORMATIONS: 'Bilan par formation',
  CERTIFICATS: 'Registre des certificats',
};

const jourFr = (j: unknown): string =>
  typeof j === 'string' ? j.split('-').reverse().join('/') : '';

/** Libellé d'un rapport : portée (session) ou modèle et période (institutionnel). */
function libelle(r: Rapport): string {
  const p = r.parametres;
  if (r.type === 'INSTITUTIONNEL') {
    return `${PORTEES[String(p.modele)] ?? 'Rapport institutionnel'} · du ${jourFr(p.du)} au ${jourFr(p.au)}`;
  }
  // US-RPT-03 : le titre dit sur qui (apprenant) ou sur quoi (module) porte le rapport.
  if (p.portee === 'INDIVIDUEL' && r.cible) return r.cible;
  if (p.portee === 'MODULE' && r.cible) return `Module : ${r.cible}`;
  return PORTEES[String(p.portee)] ?? r.type;
}

const taille = (o: number | null): string =>
  o === null ? '' : o < 1024 ? `${o} o` : `${Math.round(o / 102.4) / 10} Ko`;

/**
 * US-RPT-01 — Liste de MES rapports (demandeur seul), rafraîchie toutes les
 * 3 s tant qu'un rapport est en attente ou en cours. `version` change quand
 * une nouvelle demande vient d'être faite.
 */
export function ListeRapports(props: { formationId?: string; version?: number }): JSX.Element {
  const { formationId, version = 0 } = props;
  const [rapports, setRapports] = useState<Rapport[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setRapports(await getMesRapports(formationId));
      setErreur(null);
    } catch (e: unknown) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de charger vos rapports.');
    }
  }, [formationId]);

  useEffect(() => {
    void charger();
  }, [charger, version]);

  const enCours = (rapports ?? []).some((r) => r.statut === 'EN_ATTENTE' || r.statut === 'EN_COURS');
  useEffect(() => {
    if (!enCours) return undefined;
    const minuteur = setInterval(() => void charger(), 3000);
    return () => clearInterval(minuteur);
  }, [enCours, charger]);

  const telecharger = async (r: Rapport): Promise<void> => {
    setMessage(null);
    try {
      await telechargerRapport(r);
    } catch (e: unknown) {
      setMessage(e instanceof AdminError ? e.message : 'Téléchargement impossible.');
    }
  };

  if (erreur !== null) return <p className="alert alert-error">{erreur}</p>;
  if (rapports === null) return <p className="page-subtitle">Chargement…</p>;
  if (rapports.length === 0) {
    return <EtatVide titre="Aucun rapport demandé" texte="Choisissez un modèle ci-dessus et « Générer » : le rapport apparaîtra ici dès qu’il sera prêt." />;
  }

  // US-UX-08 : une carte par rapport, statut en pastille, une action (« Télécharger » quand il est prêt).
  return (
    <>
      {message !== null && <p className="alert alert-error">{message}</p>}
      <ul className="mes-rapports">
        {rapports.map((r) => (
          <li key={r.id} className="mon-rapport">
            <span className="section-page-icone" aria-hidden="true">
              <Icone nom={r.format === 'PDF' ? 'fichier' : 'grille'} taille={20} />
            </span>
            <div className="mon-rapport-corps">
              <span className="mon-rapport-titre">
                {r.format} · {libelle(r)}
              </span>
              {!formationId && r.formation && <span className="mon-rapport-detail">{r.formation.titre}</span>}
              <span className="mon-rapport-detail">
                Demandé le {dateHeureFr(r.dateDemande)}
                {r.statut === 'PRET' && r.tailleOctets !== null ? ` · ${taille(r.tailleOctets)}` : ''}
              </span>
              {r.statut === 'ECHEC' && (
                <span className="rapport-erreur">Génération impossible : redemandez le rapport.</span>
              )}
            </div>
            <PastilleStatut statut={r.statut === 'PRET' ? 'SUCCES' : r.statut} libelle={STATUTS[r.statut]} />
            {r.statut === 'PRET' && (
              <button type="button" className="btn-sm" onClick={() => void telecharger(r)}>
                <Icone nom="telecharger" taille={16} />
                Télécharger
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

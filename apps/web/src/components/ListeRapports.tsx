'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminError, getMesRapports, Rapport, telechargerRapport } from '../lib/api';
import { dateHeureFr } from '../lib/format';

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
};

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
  if (rapports.length === 0) return <p className="page-subtitle">Aucun rapport demandé.</p>;

  return (
    <>
      {message !== null && <p className="alert alert-error">{message}</p>}
      <ul className="rapports-liste">
        {rapports.map((r) => (
          <li key={r.id} className="rapport-ligne">
            <div className="rapport-infos">
              <strong>
                {r.format} · {PORTEES[String(r.parametres.portee)] ?? r.type}
              </strong>
              {!formationId && r.formation && <span>{r.formation.titre}</span>}
              <span className="rapport-date">
                Demandé le {dateHeureFr(r.dateDemande)}
                {r.statut === 'PRET' && r.tailleOctets !== null ? ` · ${taille(r.tailleOctets)}` : ''}
              </span>
              {r.statut === 'ECHEC' && (
                <span className="rapport-erreur">Génération impossible : redemandez le rapport.</span>
              )}
            </div>
            <span className={`rapport-statut rapport-${r.statut}`}>{STATUTS[r.statut]}</span>
            {r.statut === 'PRET' && (
              <button type="button" className="btn-sm btn-primary-sm" onClick={() => void telecharger(r)}>
                Télécharger
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

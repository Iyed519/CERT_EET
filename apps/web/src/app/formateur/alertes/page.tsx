'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  AlerteDecrochage,
  AlerteDetail,
  getAlerte,
  getAlertes,
  rouvrirAlerte,
  StatutAlerte,
  traiterAlerte,
} from '../../../lib/api';
import {
  dateHeureFr,
  faitsAlerteFr,
  LIBELLES_CRITERE_ALERTE,
  nomApprenantFr,
} from '../../../lib/format';

const STATUTS: Array<[StatutAlerte | '', string]> = [
  ['OUVERTE', 'Ouvertes'],
  ['TRAITEE', 'Traitées'],
  ['', 'Toutes'],
];

const messageDe = (e: unknown, defaut: string): string =>
  e instanceof AdminError ? e.message : defaut;

/**
 * US-SUIVI-02 / US-SUIVI-03 — Alertes de décrochage du formateur (DS-14 P2).
 *
 * Alertes créées par le balayage planifié sur les formations où le formateur
 * est affecté (l'API filtre ; l'administrateur les voit toutes). Chaque carte
 * permet de saisir l'action menée et de marquer l'alerte « Traitée », de la
 * rouvrir avec un motif, et d'afficher son historique (jamais écrasé).
 */
export default function AlertesPage(): JSX.Element {
  const [statut, setStatut] = useState<StatutAlerte | ''>('OUVERTE');
  const [alertes, setAlertes] = useState<AlerteDecrochage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setAlertes(null);
    setErreur(null);
    getAlertes(statut ? { statut } : {})
      .then(setAlertes)
      .catch((e: unknown) => setErreur(messageDe(e, 'Impossible de charger les alertes.')));
  }, [statut]);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/formateur/formations">
          ← Mes formations
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1 className="page-title">Alertes de décrochage</h1>
          <p className="page-subtitle">
            Créées automatiquement sur des faits : inactivité de plus de 7 jours, deux échecs de QCM
            consécutifs, livrable non rendu 48 h après la date limite, note en forte baisse.
          </p>
        </div>
      </div>

      <div className="filtres-livrables" role="group" aria-label="Statut">
        {STATUTS.map(([v, l]) => (
          <button
            key={l}
            type="button"
            className={`filtre-livrable${statut === v ? ' filtre-livrable-actif' : ''}`}
            aria-pressed={statut === v}
            onClick={() => setStatut(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {alertes === null && erreur === null && <p className="page-subtitle">Chargement…</p>}
      {alertes !== null && alertes.length === 0 && (
        <p className="alert alert-success">Aucune alerte {statut === 'OUVERTE' ? 'ouverte' : ''}.</p>
      )}

      <ul className="alertes-liste">
        {(alertes ?? []).map((a) => (
          <CarteAlerte key={a.id} alerte={a} onChange={charger} />
        ))}
      </ul>
    </>
  );
}

function CarteAlerte({
  alerte,
  onChange,
}: {
  alerte: AlerteDecrochage;
  onChange: () => void;
}): JSX.Element {
  const [saisie, setSaisie] = useState<'traiter' | 'rouvrir' | null>(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlerteDetail | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  const basculerHistorique = (): void => {
    if (historiqueOuvert) {
      setHistoriqueOuvert(false);
      return;
    }
    setHistoriqueOuvert(true);
    getAlerte(alerte.id)
      .then(setDetail)
      .catch((e: unknown) => setErreur(messageDe(e, 'Impossible de charger l’historique.')));
  };

  const envoyer = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      if (saisie === 'traiter') await traiterAlerte(alerte.id, texte);
      else await rouvrirAlerte(alerte.id, texte);
      setSaisie(null);
      setTexte('');
      onChange();
    } catch (err) {
      setErreur(messageDe(err, 'Action impossible.'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <li className={`alerte-carte alerte-${alerte.statut}`}>
      <div className="alerte-tete">
        <span className="badge-risque">{LIBELLES_CRITERE_ALERTE[alerte.critere] ?? alerte.critere}</span>
        <span className="alerte-date">{dateHeureFr(alerte.dateCreation)}</span>
      </div>
      <p className="alerte-qui">
        <strong>{nomApprenantFr(alerte.apprenant)}</strong> ·{' '}
        <Link href={`/formateur/formations/${alerte.formation.id}/suivi`}>{alerte.formation.titre}</Link>
      </p>
      <p className="alerte-faits">{faitsAlerteFr(alerte.critere, alerte.donnees)}</p>
      <p className="alerte-suggestion">Suggestion : {alerte.suggestion}</p>
      {alerte.statut === 'TRAITEE' && alerte.dateTraitement && (
        <p className="kpi-sous">Traitée le {dateHeureFr(alerte.dateTraitement)}</p>
      )}

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {saisie ? (
        <form className="alerte-saisie" onSubmit={(e) => void envoyer(e)}>
          <label className="field">
            <span className="field-label">
              {saisie === 'traiter' ? 'Action menée' : 'Motif de la réouverture'}
            </span>
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              required
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={
                saisie === 'traiter'
                  ? 'Ex. : appel téléphonique, point d’étape fixé lundi.'
                  : 'Ex. : pas de reprise constatée.'
              }
            />
          </label>
          <div className="row-actions">
            <button className="btn btn-primary-sm" type="submit" disabled={envoi || !texte.trim()}>
              {saisie === 'traiter' ? 'Marquer « Traitée »' : 'Rouvrir'}
            </button>
            <button className="btn-sm" type="button" onClick={() => setSaisie(null)} disabled={envoi}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="row-actions alerte-actions">
          {alerte.statut === 'OUVERTE' ? (
            <button className="btn btn-primary-sm" type="button" onClick={() => setSaisie('traiter')}>
              Traiter
            </button>
          ) : (
            <button className="btn-sm" type="button" onClick={() => setSaisie('rouvrir')}>
              Rouvrir
            </button>
          )}
          <button className="btn-sm" type="button" onClick={basculerHistorique}>
            {historiqueOuvert ? 'Masquer l’historique' : 'Historique'}
          </button>
        </div>
      )}

      {historiqueOuvert && (
        <div className="alerte-historique">
          {!detail ? (
            <p className="kpi-sous">Chargement…</p>
          ) : detail.historique.length === 0 ? (
            <p className="kpi-sous">Aucune action pour l’instant.</p>
          ) : (
            <ol className="fiche-liste">
              {detail.historique.map((h) => (
                <li key={h.id}>
                  <span>
                    <strong>{h.type === 'TRAITEMENT' ? 'Traitée' : 'Rouverte'}</strong> · {h.commentaire}
                    {h.auteur && ` — ${nomApprenantFr(h.auteur)}`}
                  </span>
                  <span>{dateHeureFr(h.date)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

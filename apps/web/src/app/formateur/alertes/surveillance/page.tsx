'use client';
import { useCallback, useEffect, useState } from 'react';
import { CarteAlerteSurveillance } from '../../../../components/AlertesSurveillance';
import { EnTetePage } from '../../../../components/EnTetePage';
import { EtatVide } from '../../../../components/EtatVide';
import {
  AdminError,
  AlerteSurveillance,
  getAlertesSurveillance,
  StatutAlerteSurveillance,
} from '../../../../lib/api';

const FILTRES: Array<[StatutAlerteSurveillance | null, string]> = [
  ['NOUVEAU', 'À examiner'],
  ['EXAMINE', 'Examinées'],
  [null, 'Toutes'],
];

/** Actualisation automatique tant que la page est visible. */
const ACTUALISATION_MS = 20_000;

/**
 * US-QCM-15 — Surveillance des QCM : les alertes envoyées par l'analyse de la
 * caméra (IA, dans le navigateur de l'apprenant), avec la photo prise au moment
 * de la détection. Formations où le formateur est affecté (l'API filtre).
 */
export default function SurveillancePage(): JSX.Element {
  const [statut, setStatut] = useState<StatutAlerteSurveillance | null>('NOUVEAU');
  const [alertes, setAlertes] = useState<AlerteSurveillance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [actualiseeA, setActualiseeA] = useState<Date | null>(null);

  const charger = useCallback(
    (silencieux = false) => {
      if (!silencieux) setAlertes(null);
      getAlertesSurveillance(statut)
        .then((a) => {
          setAlertes(a);
          setErreur(null);
          setActualiseeA(new Date());
        })
        .catch((e: unknown) =>
          setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les alertes.'),
        );
    },
    [statut],
  );

  useEffect(() => {
    charger();
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') charger(true);
    }, ACTUALISATION_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  /** Une alerte mise à jour : remplacée, ou retirée si elle ne correspond plus au filtre. */
  const remplacer = (a: AlerteSurveillance): void =>
    setAlertes((liste) =>
      (liste ?? []).flatMap((x) => (x.id !== a.id ? [x] : statut && a.statut !== statut ? [] : [a])),
    );

  return (
    <>
      <EnTetePage
        titre="Surveillance des QCM"
        phrase="Alertes envoyées par l’analyse automatique de la caméra pendant vos QCM surveillés, avec la photo prise au moment de la détection. L’IA signale ; c’est vous qui décidez."
        statut={
          actualiseeA && (
            <span className="field-hint" aria-live="polite">
              Actualisé à{' '}
              {actualiseeA.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )
        }
      />

      <div className="filtres-livrables" role="group" aria-label="Statut des alertes">
        {FILTRES.map(([v, l]) => (
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
        <EtatVide
          titre={statut === 'NOUVEAU' ? 'Aucune alerte à examiner' : 'Aucune alerte'}
          texte="Quand l’analyse de la caméra repère un téléphone, une autre personne, une absence prolongée ou une page quittée pendant un QCM surveillé, l’alerte et sa photo apparaissent ici."
        />
      )}

      {alertes !== null && alertes.length > 0 && (
        <ul className="surv-grille">
          {alertes.map((a) => (
            <CarteAlerteSurveillance key={a.id} alerte={a} onChange={remplacer} />
          ))}
        </ul>
      )}
    </>
  );
}

'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AdminError,
  AlerteSurveillance,
  examinerAlerteSurveillance,
  getAlertesTentative,
  lienPhotoAlerte,
  TypeAlerteSurveillance,
} from '../lib/api';
import { dateHeureFr, nomApprenantFr } from '../lib/format';
import { Fenetre } from './Fenetre';

/**
 * US-QCM-15 — Alertes de la surveillance par IA, vues par le formateur :
 * la photo prise à l'instant de la détection, l'anomalie, l'apprenant, le
 * QCM et l'heure ; « Marquer examinée » ou « Remettre à examiner ». La photo
 * est chargée par lien signé (2 min) seulement quand la carte est visible.
 */

/** Gravité d'affichage : présence d'un tiers ou d'un objet > absence / page > technique. */
const GRAVITE: Record<TypeAlerteSurveillance, 'forte' | 'moyenne' | 'info'> = {
  TELEPHONE: 'forte',
  PERSONNES_MULTIPLES: 'forte',
  DOCUMENT: 'forte',
  ABSENCE: 'moyenne',
  ONGLET_QUITTE: 'moyenne',
  CAMERA_MASQUEE: 'moyenne',
  ANALYSE_INDISPONIBLE: 'info',
};

const messageDe = (e: unknown, defaut: string): string =>
  e instanceof AdminError ? e.message : defaut;

/** Photo d'une alerte : chargée quand elle devient visible ; un nouvel essai si le lien a expiré. */
export function PhotoAlerte({
  alerte,
  grande = false,
}: {
  alerte: AlerteSurveillance;
  grande?: boolean;
}): JSX.Element {
  const cadre = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);
  const essais = useRef(0);

  const charger = (): void => {
    essais.current += 1;
    lienPhotoAlerte(alerte.id)
      .then((u) => {
        setUrl(u);
        setErreur(false);
      })
      .catch(() => setErreur(true));
  };

  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      charger();
      return;
    }
    const obs = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        obs.disconnect();
        charger();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerte.id]);

  const description = `${alerte.libelle} — ${nomApprenantFr(alerte.apprenant)}, ${dateHeureFr(alerte.detecteLe)}`;
  return (
    <div ref={cadre} className={`surv-photo${grande ? ' surv-photo--grande' : ''}`}>
      {url && !erreur ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Photo prise au moment de l’alerte : ${description}`}
          onError={() => {
            // Lien expiré (2 min) : un seul nouvel essai.
            if (essais.current < 2) charger();
            else setErreur(true);
          }}
        />
      ) : erreur ? (
        <span className="surv-photo-message">Photo indisponible</span>
      ) : (
        <span className="surv-photo-message" aria-hidden="true">
          Chargement de la photo…
        </span>
      )}
    </div>
  );
}

/** Pastille de l'anomalie (couleur selon la gravité, texte toujours présent). */
export function PastilleAnomalie({ alerte }: { alerte: AlerteSurveillance }): JSX.Element {
  return (
    <span className={`surv-pastille surv-pastille--${GRAVITE[alerte.type]}`}>{alerte.libelle}</span>
  );
}

/** Bouton « Marquer examinée » / « Remettre à examiner ». */
function BoutonExamen({
  alerte,
  onChange,
  principal,
}: {
  alerte: AlerteSurveillance;
  onChange: (a: AlerteSurveillance) => void;
  principal: boolean;
}): JSX.Element {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const nouvelle = alerte.statut === 'NOUVEAU';
  const basculer = async (): Promise<void> => {
    setEnvoi(true);
    setErreur(null);
    try {
      onChange(await examinerAlerteSurveillance(alerte.id, nouvelle ? 'EXAMINE' : 'NOUVEAU'));
    } catch (e) {
      setErreur(messageDe(e, 'Action impossible.'));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={nouvelle && principal ? 'btn-sm btn-primary-sm' : 'btn-sm'}
        onClick={() => void basculer()}
        disabled={envoi}
      >
        {envoi ? 'Enregistrement…' : nouvelle ? 'Marquer examinée' : 'Remettre à examiner'}
      </button>
      {erreur && (
        <span className="field-error" role="alert">
          {erreur}
        </span>
      )}
    </>
  );
}

/** Détails d'une alerte (fenêtre agrandie). */
function FicheAlerte({
  alerte,
  onClose,
  onChange,
}: {
  alerte: AlerteSurveillance;
  onClose: () => void;
  onChange: (a: AlerteSurveillance) => void;
}): JSX.Element {
  return (
    <Fenetre
      titre={alerte.libelle}
      sousTitre={`${nomApprenantFr(alerte.apprenant)} · ${dateHeureFr(alerte.detecteLe)}`}
      onClose={onClose}
      taille="large"
      actions={
        <>
          <BoutonExamen alerte={alerte} onChange={onChange} principal />
          <Link
            className="btn-sm"
            href={`/formateur/qcm/${alerte.qcm.id}/tentatives?tentative=${alerte.tentativeId}`}
          >
            Voir la tentative
          </Link>
        </>
      }
    >
      <PhotoAlerte alerte={alerte} grande />
      <dl className="surv-fiche">
        <div>
          <dt>Apprenant</dt>
          <dd>{nomApprenantFr(alerte.apprenant)}</dd>
        </div>
        <div>
          <dt>QCM</dt>
          <dd>
            {alerte.qcm.titre} · {alerte.formation.titre}
          </dd>
        </div>
        <div>
          <dt>Détectée le</dt>
          <dd>{dateHeureFr(alerte.detecteLe)}</dd>
        </div>
        {alerte.confiance !== null && (
          <div>
            <dt>Certitude du modèle</dt>
            <dd>{Math.round(alerte.confiance * 100)} %</dd>
          </div>
        )}
        <div>
          <dt>Statut</dt>
          <dd>
            {alerte.statut === 'NOUVEAU'
              ? 'À examiner'
              : `Examinée${alerte.examineLe ? ` le ${dateHeureFr(alerte.examineLe)}` : ''}`}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        L’IA signale une situation à vérifier ; c’est vous qui décidez s’il y a fraude.
      </p>
    </Fenetre>
  );
}

/** Une carte de la file : photo, anomalie, apprenant, QCM, heure, actions. */
export function CarteAlerteSurveillance({
  alerte,
  onChange,
  compacte = false,
}: {
  alerte: AlerteSurveillance;
  onChange: (a: AlerteSurveillance) => void;
  /** Dans la fenêtre d'une tentative : sans l'apprenant ni le QCM (déjà connus). */
  compacte?: boolean;
}): JSX.Element {
  const [ouverte, setOuverte] = useState(false);
  const nouvelle = alerte.statut === 'NOUVEAU';
  return (
    <li className={`surv-carte${nouvelle ? ' surv-carte--nouvelle' : ''}`}>
      <button
        type="button"
        className="surv-carte-photo"
        onClick={() => setOuverte(true)}
        aria-label={`Agrandir la photo : ${alerte.libelle}`}
      >
        <PhotoAlerte alerte={alerte} />
      </button>
      <div className="surv-carte-corps">
        <div className="surv-carte-tete">
          <PastilleAnomalie alerte={alerte} />
          {nouvelle && <span className="surv-nouvelle">À examiner</span>}
        </div>
        {!compacte && (
          <p className="surv-carte-qui">
            <strong>{nomApprenantFr(alerte.apprenant)}</strong>
            <span>
              {alerte.qcm.titre} · {alerte.formation.titre}
            </span>
          </p>
        )}
        <p className="surv-carte-quand">
          {dateHeureFr(alerte.detecteLe)}
          {alerte.confiance !== null && ` · certitude ${Math.round(alerte.confiance * 100)} %`}
        </p>
        <div className="row-actions">
          <BoutonExamen alerte={alerte} onChange={onChange} principal={!compacte} />
          <button type="button" className="btn-sm btn-lien" onClick={() => setOuverte(true)}>
            Agrandir
          </button>
        </div>
      </div>
      {ouverte && (
        <FicheAlerte
          alerte={alerte}
          onClose={() => setOuverte(false)}
          onChange={(a) => {
            onChange(a);
          }}
        />
      )}
    </li>
  );
}

/**
 * Section « Alertes de surveillance » de la fenêtre d'une tentative : les
 * alertes de l'IA de CETTE tentative, avec leur photo.
 */
export function AlertesTentative({ tentativeId }: { tentativeId: string }): JSX.Element | null {
  const [alertes, setAlertes] = useState<AlerteSurveillance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setAlertes(null);
    getAlertesTentative(tentativeId)
      .then(setAlertes)
      .catch((e: unknown) => setErreur(messageDe(e, 'Impossible de charger les alertes.')));
  }, [tentativeId]);

  if (erreur) return <p className="alert alert-error">{erreur}</p>;
  if (alertes === null || alertes.length === 0) return null;
  const aExaminer = alertes.filter((a) => a.statut === 'NOUVEAU').length;
  return (
    <section className="surv-tentative" aria-labelledby={`surv-${tentativeId}`}>
      <h3 id={`surv-${tentativeId}`}>Alertes de surveillance</h3>
      <p className="field-hint">
        {alertes.length} alerte{alertes.length > 1 ? 's' : ''} de l’analyse de la caméra
        {aExaminer > 0 ? `, dont ${aExaminer} à examiner` : ''}. Cliquez sur une photo pour
        l’agrandir.
      </p>
      <ul className="surv-grille">
        {alertes.map((a) => (
          <CarteAlerteSurveillance
            key={a.id}
            alerte={a}
            compacte
            onChange={(n) => setAlertes((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)))}
          />
        ))}
      </ul>
    </section>
  );
}

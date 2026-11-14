import Link from 'next/link';
import { ReactNode } from 'react';
import { Icone } from './Icone';
import { etapeCourante } from '../lib/ui-regles';

export type EtatEtape = 'fait' | 'en-cours' | 'a-faire' | 'bloquant';

export interface Etape {
  libelle: string;
  etat: EtatEtape;
  /** Précision courte (« 12 questions », « 2 conditions manquantes »). */
  detail?: string;
  /** L'étape mène à sa partie de la page (onglet, ancre). */
  href?: string;
  onClick?: () => void;
}

const TEXTE_ETAT: Record<EtatEtape, string> = {
  fait: 'fait',
  'en-cours': 'en cours',
  'a-faire': 'à faire',
  bloquant: 'bloquant',
};


/**
 * US-UX-01 — Progression d'un parcours (rédiger → paramétrer → publier → suivre).
 * Liste ordonnée : numéro ou coche, libellé, état en toutes lettres (jamais la
 * couleur seule) ; l'étape courante porte `aria-current="step"`. `action` est la
 * prochaine action, en bouton principal, à droite (dessous sur mobile).
 */
export function Etapes({
  etapes,
  libelle,
  action,
}: {
  etapes: Etape[];
  libelle: string;
  action?: ReactNode;
}): JSX.Element {
  const courante = etapeCourante(etapes);
  return (
    <div className="etapes">
      <ol className="etapes-liste" aria-label={libelle}>
        {etapes.map((e, i) => {
          const corps = (
            <>
              <span className="etapes-marque" aria-hidden="true">
                {e.etat === 'fait' ? (
                  <Icone nom="succes" taille={18} />
                ) : e.etat === 'bloquant' ? (
                  <Icone nom="alerte" taille={18} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="etapes-texte">
                <span className="etapes-libelle">{e.libelle}</span>
                <span className="etapes-etat">
                  {TEXTE_ETAT[e.etat]}
                  {e.detail ? ` · ${e.detail}` : ''}
                </span>
              </span>
            </>
          );
          return (
            <li
              key={e.libelle}
              className={`etapes-etape etapes-${e.etat}`}
              aria-current={i === courante ? 'step' : undefined}
            >
              {e.href ? (
                <Link href={e.href} className="etapes-lien" scroll={false}>
                  {corps}
                </Link>
              ) : e.onClick ? (
                <button type="button" className="etapes-lien" onClick={e.onClick}>
                  {corps}
                </button>
              ) : (
                <span className="etapes-lien">{corps}</span>
              )}
            </li>
          );
        })}
      </ol>
      {action && <div className="etapes-action">{action}</div>}
    </div>
  );
}

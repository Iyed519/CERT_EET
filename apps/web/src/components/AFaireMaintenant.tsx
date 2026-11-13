import Link from 'next/link';
import { ReactNode } from 'react';
import type { ElementAFaire } from '../lib/a-faire';

/**
 * US-UI-03 — Bloc « À faire maintenant », en tête de la page d'accueil de
 * chaque rôle : une ligne par chose à faire, un bouton qui mène à l'écran où
 * la faire ; un état vide utile quand il n'y a rien.
 */
export function AFaireMaintenant({
  elements,
  chargement = false,
  erreur = null,
  vide,
}: {
  elements: ElementAFaire[];
  chargement?: boolean;
  erreur?: string | null;
  /** Phrase et action de l'état vide. */
  vide: { texte: string; action?: ReactNode };
}): JSX.Element {
  return (
    <section className="a-faire" aria-labelledby="titre-a-faire">
      <h2 className="a-faire-titre" id="titre-a-faire">
        À faire maintenant
        {!chargement && elements.length > 0 && <span className="a-faire-compte">{elements.length}</span>}
      </h2>
      {erreur !== null && (
        <p className="alert alert-error" role="alert">
          {erreur}
        </p>
      )}
      {chargement ? (
        <p className="field-hint">Chargement…</p>
      ) : elements.length === 0 && erreur === null ? (
        <div className="etat-vide">
          <p className="etat-vide-titre">Rien à faire pour l’instant</p>
          <p className="etat-vide-texte">{vide.texte}</p>
          {vide.action}
        </div>
      ) : (
        <ul className="a-faire-liste">
          {elements.map((e) => (
            <li key={e.cle} className={`a-faire-element${e.urgence === 0 ? ' a-faire-urgent' : ''}`}>
              <div className="a-faire-texte">
                <span className="a-faire-libelle">{e.libelle}</span>
                <span className="a-faire-detail">{e.detail}</span>
              </div>
              <Link className="btn-sm btn-primary-sm btn-lien" href={e.href}>
                {e.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

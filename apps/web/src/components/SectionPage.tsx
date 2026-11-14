import { ReactNode, useId } from 'react';
import { Icone, NomIcone } from './Icone';

/**
 * US-UX-01 — Section d'une page : titre (h2) précédé d'une icône, phrase
 * facultative, actions à droite, contenu dessous, sur une surface qui la
 * détache du fond (carte blanche, filet, espacement). `ton="accent"` met la
 * section en avant (filet rouge à gauche) ; `ton="discret"` la laisse sans carte.
 */
export function SectionPage({
  titre,
  icone,
  phrase,
  actions,
  ton = 'normal',
  id,
  children,
}: {
  titre: ReactNode;
  icone?: NomIcone;
  phrase?: ReactNode;
  actions?: ReactNode;
  ton?: 'normal' | 'accent' | 'discret';
  id?: string;
  children?: ReactNode;
}): JSX.Element {
  const auto = useId();
  const idTitre = `${id ?? auto}-titre`;
  return (
    <section id={id} className={`section-page section-page-${ton}`} aria-labelledby={idTitre}>
      <div className="section-page-tete">
        <div className="section-page-titres">
          <h2 id={idTitre} className="section-page-titre">
            {icone && (
              <span className="section-page-icone">
                <Icone nom={icone} taille={20} />
              </span>
            )}
            {titre}
          </h2>
          {phrase && <p className="section-page-phrase">{phrase}</p>}
        </div>
        {actions && <div className="section-page-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

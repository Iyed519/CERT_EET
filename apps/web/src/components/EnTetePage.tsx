import { ReactNode } from 'react';

/**
 * US-UI-04 — En-tête commun d'une page : titre, une phrase qui dit à quoi sert
 * l'écran, une pastille d'état facultative et les actions (au plus une
 * action principale, les autres en secondaire).
 */
export function EnTetePage({
  titre,
  phrase,
  statut,
  actions,
}: {
  titre: ReactNode;
  phrase?: ReactNode;
  statut?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{titre}</h1>
        {phrase && <p className="page-subtitle">{phrase}</p>}
      </div>
      {(statut || actions) && (
        <div className="row-actions">
          {statut}
          {actions}
        </div>
      )}
    </div>
  );
}

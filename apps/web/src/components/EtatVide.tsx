import { ReactNode } from 'react';

/**
 * US-UI-04 — État vide utile : ce qui manque, et quoi faire maintenant
 * (classes `.etat-vide` de la charte, US-UI-02).
 */
export function EtatVide({
  titre,
  texte,
  action,
}: {
  titre: string;
  texte: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="etat-vide">
      <p className="etat-vide-titre">{titre}</p>
      <p className="etat-vide-texte">{texte}</p>
      {action}
    </div>
  );
}

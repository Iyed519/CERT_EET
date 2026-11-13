'use client';

import { useEffect, useState } from 'react';
import { EtatIa, getEtatIa } from '../lib/api';

/**
 * US-IA-09 — Dit clairement, avant de lancer, si l'IA réelle répond : rien
 * quand Claude est branché ; alerte rouge si aucune clé n'est configurée ;
 * alerte d'information en mode démonstration (fournisseur factice demandé).
 * `onEtat` permet à la fenêtre de désactiver son bouton de lancement.
 */
export function EtatIaAlerte({
  onEtat,
}: {
  onEtat?: (etat: EtatIa) => void;
}): JSX.Element | null {
  const [etat, setEtat] = useState<EtatIa | null>(null);

  useEffect(() => {
    let actif = true;
    getEtatIa()
      .then((e) => {
        if (!actif) return;
        setEtat(e);
        onEtat?.(e);
      })
      .catch(() => {
        // État indisponible : la carte de la génération dira l'erreur réelle.
      });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (etat === null || etat.reel || etat.message === null) return null;
  if (etat.fournisseur === 'non-configure') {
    return (
      <div className="alert alert-error etat-ia" role="alert">
        <strong>IA non configurée.</strong> {etat.message}
      </div>
    );
  }
  return (
    <div className="alert alert-info etat-ia" role="status">
      <strong>Mode démonstration.</strong> {etat.message}
    </div>
  );
}

/** Vrai si l'état empêche tout appel (lancement inutile). */
export function iaIndisponible(etat: EtatIa | null): boolean {
  return etat !== null && etat.fournisseur === 'non-configure';
}

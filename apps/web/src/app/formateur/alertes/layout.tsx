'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ongletActif, SOUS_NAVIGATION_FORMATEUR } from '../../../components/navigation';
import { getNombreAlertesSurveillance } from '../../../lib/api';

/**
 * US-QCM-15 — Section « Alertes » du formateur : deux onglets, le décrochage
 * (US-SUIVI-02) et la surveillance des QCM par IA. Le nombre d'alertes de
 * surveillance à examiner est affiché sur l'onglet (actualisé à chaque
 * changement de page de la section).
 */
export default function AlertesLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const onglets = SOUS_NAVIGATION_FORMATEUR.Alertes;
  const actif = ongletActif(onglets, pathname);
  const [aExaminer, setAExaminer] = useState<number | null>(null);

  useEffect(() => {
    getNombreAlertesSurveillance()
      .then(setAExaminer)
      .catch(() => setAExaminer(null));
  }, [pathname]);

  return (
    <div>
      <nav className="admin-tabs" aria-label="Section Alertes">
        {onglets.map(([href, libelle]) => {
          const estActif = actif?.[0] === href;
          const compteur = href.endsWith('/surveillance') && aExaminer ? aExaminer : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`admin-tab${estActif ? ' admin-tab-active' : ''}`}
              aria-current={estActif ? 'page' : undefined}
            >
              {libelle}
              {compteur > 0 && (
                <span className="onglet-compteur" aria-label={`${compteur} à examiner`}>
                  {compteur > 99 ? '99+' : compteur}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

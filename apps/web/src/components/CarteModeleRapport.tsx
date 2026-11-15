'use client';
import { ReactNode, useState } from 'react';
import type { FormatRapport } from '../lib/api';
import { FiltresPastilles } from './FiltresPastilles';
import { Icone, NomIcone } from './Icone';

/**
 * US-UX-08 — Carte d'un modèle de rapport : à quoi il sert, ses formats (pastilles
 * PDF / CSV) et son bouton « Générer ». `children` accueille un choix propre au
 * modèle (apprenant, module) ; `pret` dit s'il est complet. La demande elle-même
 * (même appel d'API qu'avant) est faite par la page.
 */
export function CarteModeleRapport({
  titre,
  description,
  icone,
  onGenerer,
  pret = true,
  envoi = false,
  children,
}: {
  titre: string;
  description: string;
  icone: NomIcone;
  onGenerer: (format: FormatRapport) => void;
  pret?: boolean;
  envoi?: boolean;
  children?: ReactNode;
}): JSX.Element {
  const [format, setFormat] = useState<FormatRapport>('PDF');
  return (
    <article className="carte-rapport">
      <div className="carte-rapport-tete">
        <span className="section-page-icone">
          <Icone nom={icone} taille={20} />
        </span>
        <h3 className="carte-rapport-titre">{titre}</h3>
      </div>
      <p className="carte-rapport-texte">{description}</p>
      {children}
      <div className="carte-rapport-pied">
        <FiltresPastilles<FormatRapport>
          libelle={`Format du rapport « ${titre} »`}
          valeur={format}
          onChange={setFormat}
          options={[
            { valeur: 'PDF', libelle: 'PDF' },
            { valeur: 'CSV', libelle: 'CSV (Excel)' },
          ]}
        />
        <span className="field-hint carte-rapport-format">
          {format === 'PDF' ? 'PDF : à imprimer ou à archiver.' : 'CSV : à ouvrir dans Excel ou un tableur.'}
        </span>
        <button type="button" className="btn-sm btn-primary-sm" disabled={!pret || envoi} onClick={() => onGenerer(format)}>
          <Icone nom="rapport" taille={16} />
          {envoi ? 'Demande…' : 'Générer'}
        </button>
      </div>
    </article>
  );
}

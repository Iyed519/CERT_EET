import Link from 'next/link';
import { ReactNode } from 'react';
import { Icone, NomIcone } from './Icone';

export type EtatIndicateur = 'normal' | 'succes' | 'attention' | 'alerte';
export type SensTendance = 'hausse' | 'baisse' | 'stable';

const ICONE_TENDANCE: Record<SensTendance, NomIcone> = {
  hausse: 'tendance-hausse',
  baisse: 'tendance-baisse',
  stable: 'tendance-stable',
};

/**
 * US-UX-01 — Indicateur clé : icône, chiffre, libellé, et en option une tendance
 * ou un état (couleur + icône + texte). Avec `href`, toute la carte est un lien
 * vers la liste filtrée correspondante (nom accessible « valeur libellé »).
 */
export function CarteIndicateur({
  libelle,
  valeur,
  icone,
  href,
  etat = 'normal',
  tendance,
  aide,
}: {
  libelle: string;
  valeur: ReactNode;
  icone?: NomIcone;
  href?: string;
  etat?: EtatIndicateur;
  tendance?: { sens: SensTendance; texte: string };
  /** Une ligne de contexte sous le libellé (« dont 2 à corriger »). */
  aide?: ReactNode;
}): JSX.Element {
  const corps = (
    <>
      <span className="indicateur-tete">
        {icone && (
          <span className="indicateur-icone">
            <Icone nom={icone} taille={20} />
          </span>
        )}
        <span className="indicateur-libelle">{libelle}</span>
      </span>
      <span className="indicateur-valeur">{valeur}</span>
      {(aide || tendance) && (
        <span className="indicateur-pied">
          {tendance && (
            <span className={`indicateur-tendance indicateur-tendance-${tendance.sens}`}>
              <Icone nom={ICONE_TENDANCE[tendance.sens]} taille={16} />
              {tendance.texte}
            </span>
          )}
          {aide && <span className="indicateur-aide">{aide}</span>}
        </span>
      )}
      {href && (
        <span className="indicateur-fleche" aria-hidden="true">
          <Icone nom="fleche-droite" taille={16} />
        </span>
      )}
    </>
  );
  const classe = `indicateur indicateur-${etat}${href ? ' indicateur-cliquable' : ''}`;
  return href ? (
    <Link href={href} className={classe}>
      {corps}
    </Link>
  ) : (
    <div className={classe}>{corps}</div>
  );
}

/** Rangée d'indicateurs, avec un titre de groupe facultatif. */
export function GroupeIndicateurs({
  titre,
  icone,
  children,
}: {
  titre?: string;
  icone?: NomIcone;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="groupe-indicateurs">
      {titre && (
        <p className="groupe-indicateurs-titre">
          {icone && <Icone nom={icone} taille={16} />}
          {titre}
        </p>
      )}
      <div className="groupe-indicateurs-grille">{children}</div>
    </div>
  );
}

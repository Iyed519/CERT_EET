import { isUUID } from 'class-validator';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';

/**
 * Règles PURES de la vérification publique (US-CERT-04, DS-05) : aucune base,
 * aucune horloge, aucune entrée/sortie.
 */

/** Verdict publié au visiteur. */
export type VerdictPublic = 'VALIDE' | 'REVOQUE' | 'INTEGRITE_COMPROMISE';

/** Intégrité du PDF stocké, recalculée à chaque vérification (DS-05). */
export type Integrite = 'VERIFIEE' | 'COMPROMISE' | 'NON_VERIFIABLE';

export const MESSAGE_INCONNU = 'Aucun certificat ne correspond à ce lien.';

/**
 * Un identifiant mal formé est traité comme un identifiant inconnu (même
 * réponse) : le visiteur n'apprend rien de la forme attendue.
 */
export function identifiantPlausible(id: string): boolean {
  return isUUID(id, '4');
}

/**
 * Seul un certificat ÉMIS (ACTIF ou REVOQUE) existe publiquement ; un
 * certificat en préparation répond « inconnu », comme un identifiant inventé.
 */
export function estPublic(statut: StatutCertificat): boolean {
  return statut === StatutCertificat.ACTIF || statut === StatutCertificat.REVOQUE;
}

/** Verdict à partir du statut et de l'intégrité recalculée. */
export function verdict(statut: StatutCertificat, integrite: Integrite): VerdictPublic {
  if (statut === StatutCertificat.REVOQUE) return 'REVOQUE';
  return integrite === 'COMPROMISE' ? 'INTEGRITE_COMPROMISE' : 'VALIDE';
}

/** Nom affiché du titulaire : prénom et nom, jamais l'email. */
export function nomTitulaire(prenom: string | null, nom: string | null): string {
  return (
    [prenom, nom]
      .filter((p) => p && p.trim().length > 0)
      .join(' ')
      .trim() || 'Titulaire'
  );
}

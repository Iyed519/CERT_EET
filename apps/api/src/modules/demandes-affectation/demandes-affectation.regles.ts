/**
 * US-FORM-07 — Règles PURES des demandes d'affectation (aucune base, aucune
 * horloge). Le service les applique sous verrou ; la base garde les mêmes
 * bornes en contraintes CHECK (filet).
 */

export type StatutDemandeAffectation = 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE' | 'ANNULEE';

export const STATUTS_DEMANDE_AFFECTATION: StatutDemandeAffectation[] = [
  'EN_ATTENTE',
  'ACCEPTEE',
  'REFUSEE',
  'ANNULEE',
];

export const MOTIF_MIN = 10;
export const MOTIF_MAX = 1000;

export const MESSAGE_MOTIF = `Le motif doit compter entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères.`;
export const MESSAGE_DEJA_AFFECTE = 'Vous enseignez déjà cette formation.';
export const MESSAGE_DEJA_EN_ATTENTE =
  'Vous avez déjà une demande en attente pour cette formation.';
export const MESSAGE_ARCHIVEE = 'Cette formation est archivée : elle ne peut plus recevoir de formateur.';
export const MESSAGE_DEJA_TRAITEE = 'Cette demande a déjà été traitée.';
export const MESSAGE_FORMATEUR_INACTIF =
  "Le demandeur n'est plus un formateur actif : la demande ne peut pas être acceptée.";

/** Motif valide : 10 à 1 000 caractères une fois les blancs de bord retirés. */
export function motifValide(motif: string | null | undefined): boolean {
  if (typeof motif !== 'string') return false;
  const n = motif.trim().length;
  return n >= MOTIF_MIN && n <= MOTIF_MAX;
}

/** Une demande ne se décide (accepter, refuser) ou ne s'annule qu'EN_ATTENTE. */
export function modifiable(statut: string): boolean {
  return statut === 'EN_ATTENTE';
}

/** Une formation archivée ne reçoit plus de demande ni d'affectation. */
export function formationOuverteAuxDemandes(statutFormation: string): boolean {
  return statutFormation !== 'ARCHIVEE';
}

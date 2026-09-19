/**
 * Cycle de vie d'une demande de changement de rôle (US-ROL-02).
 *
 * EN_ATTENTE (état initial) -> APPROUVEE ou REJETEE (états terminaux, posés par
 * un administrateur). Une demande terminale ne peut plus être re-traitée (409).
 */
export enum StatutDemande {
  EN_ATTENTE = 'EN_ATTENTE',
  APPROUVEE = 'APPROUVEE',
  REJETEE = 'REJETEE',
}

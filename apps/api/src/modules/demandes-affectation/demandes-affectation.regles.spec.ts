import {
  formationOuverteAuxDemandes,
  modifiable,
  motifValide,
  MOTIF_MAX,
  MOTIF_MIN,
} from './demandes-affectation.regles';

describe('US-FORM-07 — règles des demandes d’affectation', () => {
  it('motif : 10 à 1 000 caractères hors blancs de bord', () => {
    expect(motifValide('a'.repeat(MOTIF_MIN))).toBe(true);
    expect(motifValide('a'.repeat(MOTIF_MAX))).toBe(true);
    expect(motifValide('a'.repeat(MOTIF_MIN - 1))).toBe(false);
    expect(motifValide('a'.repeat(MOTIF_MAX + 1))).toBe(false);
    expect(motifValide(`   ${'a'.repeat(9)}    `)).toBe(false);
    expect(motifValide(`  ${'a'.repeat(10)}  `)).toBe(true);
    expect(motifValide(undefined)).toBe(false);
    expect(motifValide(null)).toBe(false);
  });

  it('seule une demande EN_ATTENTE se décide ou s’annule', () => {
    expect(modifiable('EN_ATTENTE')).toBe(true);
    for (const s of ['ACCEPTEE', 'REFUSEE', 'ANNULEE']) expect(modifiable(s)).toBe(false);
  });

  it('une formation archivée ne reçoit plus de demande', () => {
    expect(formationOuverteAuxDemandes('ARCHIVEE')).toBe(false);
    expect(formationOuverteAuxDemandes('OUVERTE')).toBe(true);
    expect(formationOuverteAuxDemandes('FERMEE')).toBe(true);
  });
});

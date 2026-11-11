import {
  creationPermise,
  decidable,
  descriptionFormation,
  MAX_PROPOSITIONS_OUVERTES,
  modifiableParLeFormateur,
  ouverte,
  texteValide,
} from './propositions-formation.regles';

describe('US-FORM-08 — règles des propositions de formation', () => {
  it('texte (motif, commentaire) : 10 à 1 000 caractères hors blancs de bord', () => {
    expect(texteValide('a'.repeat(10))).toBe(true);
    expect(texteValide('a'.repeat(1000))).toBe(true);
    expect(texteValide('a'.repeat(9))).toBe(false);
    expect(texteValide('a'.repeat(1001))).toBe(false);
    expect(texteValide(`   ${'a'.repeat(9)}   `)).toBe(false);
    expect(texteValide(undefined)).toBe(false);
  });

  it('au plus 5 propositions ouvertes (en attente ou à modifier)', () => {
    expect(MAX_PROPOSITIONS_OUVERTES).toBe(5);
    expect(creationPermise(4)).toBe(true);
    expect(creationPermise(5)).toBe(false);
    expect(ouverte('EN_ATTENTE')).toBe(true);
    expect(ouverte('A_MODIFIER')).toBe(true);
    expect(ouverte('ACCEPTEE')).toBe(false);
    expect(ouverte('REFUSEE')).toBe(false);
  });

  it('le formateur modifie tant que la proposition est ouverte ; l’administrateur décide sur EN_ATTENTE seulement', () => {
    expect(modifiableParLeFormateur('A_MODIFIER')).toBe(true);
    expect(modifiableParLeFormateur('EN_ATTENTE')).toBe(true);
    expect(modifiableParLeFormateur('ACCEPTEE')).toBe(false);
    expect(decidable('EN_ATTENTE')).toBe(true);
    expect(decidable('A_MODIFIER')).toBe(false);
    expect(decidable('REFUSEE')).toBe(false);
  });

  it('description de la formation créée : description puis public visé', () => {
    expect(descriptionFormation(' Docker et K8s. ', ' Développeurs ')).toBe(
      'Docker et K8s.\n\nPublic visé : Développeurs',
    );
    expect(descriptionFormation(null, 'Admins')).toBe('Public visé : Admins');
    expect(descriptionFormation('Texte', '  ')).toBe('Texte');
    expect(descriptionFormation(null, null)).toBeNull();
  });
});

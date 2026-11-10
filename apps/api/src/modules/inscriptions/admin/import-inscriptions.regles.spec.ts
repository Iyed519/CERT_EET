import {
  BORNES_IMPORT,
  MESSAGE_IMPORT_ENCODAGE,
  MESSAGE_IMPORT_TROP_GROS,
  MESSAGE_IMPORT_TROP_LONG,
  MESSAGE_IMPORT_VIDE,
  bilan,
  emailValide,
  lireFichier,
} from './import-inscriptions.regles';

const f = (texte: string): Buffer => Buffer.from(texte, 'utf8');

describe('import-inscriptions.regles (US-INSC-02)', () => {
  it('une adresse par ligne, en-tête facultatif, BOM, CRLF, lignes vides, séparateurs', () => {
    expect(lireFichier(f('﻿email;nom\r\nA@X.tn;Amel\r\n\r\n"b@x.tn",Ben\n  c@x.tn  \r'))).toEqual([
      { ligne: 2, email: 'a@x.tn' },
      { ligne: 4, email: 'b@x.tn' },
      { ligne: 5, email: 'c@x.tn' },
    ]);
    expect(lireFichier(f('a@x.tn\nE-mail'))).toEqual([
      { ligne: 1, email: 'a@x.tn' },
      { ligne: 2, email: 'e-mail' },
    ]);
  });

  it('refus : vide, trop de lignes, trop gros, non UTF-8', () => {
    expect(() => lireFichier(f('email\n\n'))).toThrow(MESSAGE_IMPORT_VIDE);
    const lignes = Array.from({ length: BORNES_IMPORT.lignesMax }, (_, i) => `u${i}@x.tn`);
    expect(lireFichier(f(lignes.join('\n')))).toHaveLength(BORNES_IMPORT.lignesMax);
    expect(() => lireFichier(f([...lignes, 'z@x.tn'].join('\n')))).toThrow(
      MESSAGE_IMPORT_TROP_LONG,
    );
    expect(() => lireFichier(Buffer.alloc(BORNES_IMPORT.tailleMaxOctets + 1, 'a'))).toThrow(
      MESSAGE_IMPORT_TROP_GROS,
    );
    expect(() => lireFichier(Buffer.from([0x61, 0xff, 0xfe, 0x0a]))).toThrow(
      MESSAGE_IMPORT_ENCODAGE,
    );
  });

  it('emailValide', () => {
    expect(emailValide('a@x.tn')).toBe(true);
    for (const e of ['a', 'a@x', '@x.tn', 'a b@x.tn', 'a@x.tn;b', `${'a'.repeat(250)}@x.tn`]) {
      expect(emailValide(e)).toBe(false);
    }
  });

  it('bilan : toutes les clés, comptes', () => {
    const b = bilan([{ resultat: 'INSCRIT' }, { resultat: 'INSCRIT' }, { resultat: 'DOUBLON' }]);
    expect(b.INSCRIT).toBe(2);
    expect(b.DOUBLON).toBe(1);
    expect(b.COMPLET).toBe(0);
    expect(Object.keys(b)).toHaveLength(9);
  });
});

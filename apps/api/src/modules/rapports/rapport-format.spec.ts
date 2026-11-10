import { BOM, cellule, csv, dateHeure, jour, nombre, pdf } from './rapport-format';

describe('rapport-format (US-RPT-01)', () => {
  describe('cellule', () => {
    it('vide pour null / undefined, oui / non pour un booléen', () => {
      expect(cellule(null)).toBe('');
      expect(cellule(undefined)).toBe('');
      expect(cellule(true)).toBe('oui');
      expect(cellule(false)).toBe('non');
    });

    it('nombre à virgule, 2 décimales au plus ; non fini -> vide', () => {
      expect(cellule(12.345)).toBe('12,35');
      expect(cellule(7)).toBe('7');
      expect(cellule(Number.NaN)).toBe('');
      expect(cellule(Number.POSITIVE_INFINITY)).toBe('');
    });

    it('neutralise l’injection de formule (= + - @ tabulation)', () => {
      expect(cellule('=SOMME(A1)')).toBe("'=SOMME(A1)");
      expect(cellule('+33')).toBe("'+33");
      expect(cellule('-1')).toBe("'-1");
      expect(cellule('@cmd')).toBe("'@cmd");
      expect(cellule('\tx')).toBe("'\tx");
      expect(cellule('a=b')).toBe('a=b');
    });

    it('met entre guillemets le séparateur, un guillemet ou un saut de ligne', () => {
      expect(cellule('a;b')).toBe('"a;b"');
      expect(cellule('dit "oui"')).toBe('"dit ""oui"""');
      expect(cellule('l1\nl2')).toBe('"l1\nl2"');
      expect(cellule('simple')).toBe('simple');
    });

    it('formate une date (heure de Tunis)', () => {
      expect(cellule(new Date('2026-11-10T09:05:00Z'))).toBe('10/11/2026 10:05');
    });
  });

  it('nombre, dateHeure, jour', () => {
    expect(nombre(0.5)).toBe('0,5');
    expect(nombre(-3.456)).toBe('-3,46');
    expect(dateHeure(new Date('2026-12-31T23:30:00Z'))).toBe('01/01/2027 00:30');
    expect(jour(new Date('2026-12-31T23:30:00Z'))).toBe('01/01/2027');
  });

  it('csv : BOM, séparateur ;, CRLF, ligne finale', () => {
    const c = csv(
      ['a', 'b'],
      [
        [1, 'x;y'],
        [null, true],
      ],
    );
    expect(c.startsWith(BOM)).toBe(true);
    expect(c).toBe(`${BOM}a;b\r\n1;"x;y"\r\n;oui\r\n`);
  });

  it('pdf : un document PDF, tableau long sur plusieurs pages', async () => {
    const tampon = await pdf({
      titre: 'Rapport',
      sousTitre: 'Formation',
      genereLe: new Date('2026-11-10T10:00:00Z'),
      sections: [
        { titre: 'Indicateurs', paires: [['Inscrits', '3']] },
        {
          titre: 'Apprenants',
          tableau: {
            colonnes: ['Nom', 'Note'],
            largeurs: [70, 30],
            lignes: Array.from({ length: 120 }, (_, i) => [`Apprenant ${i}`, String(i)]),
          },
        },
        { titre: 'Vide', vide: 'Aucun élément.' },
      ],
    });
    const texte = tampon.toString('latin1');
    expect(texte.startsWith('%PDF-')).toBe(true);
    const pages = texte.match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});

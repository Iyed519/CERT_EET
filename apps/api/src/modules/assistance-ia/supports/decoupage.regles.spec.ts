import { caracteresUtiles, decouper, DECOUPAGE, normaliserTexte } from './decoupage.regles';

describe('decoupage.regles (US-IA-01)', () => {
  describe('normaliserTexte', () => {
    it('unifie les fins de ligne, réduit les espaces et les paragraphes vides', () => {
      expect(normaliserTexte('a\r\nb\rc')).toBe('a\nb\nc');
      expect(normaliserTexte('  un \t  deux trois  ')).toBe('un deux trois');
      expect(normaliserTexte('a\n\n\n\n\nb')).toBe('a\n\nb');
      expect(normaliserTexte('ligne  \n   suite')).toBe('ligne\nsuite');
    });

    it('recolle les césures de fin de ligne et retire les caractères de contrôle', () => {
      expect(normaliserTexte('la sécu-\nrité du jeton')).toBe('la sécurité du jeton');
      expect(normaliserTexte('Paris-\nNord')).toBe('Paris-\nNord');
      expect(normaliserTexte('﻿a\u0000b­c')).toBe('abc');
    });
  });

  it('compte les caractères hors espaces', () => {
    expect(caracteresUtiles(' a b\n c ')).toBe(3);
  });

  describe('decouper', () => {
    it('un texte court donne un seul passage ; un texte vide, aucun', () => {
      expect(decouper('Bonjour.')).toEqual(['Bonjour.']);
      expect(decouper('')).toEqual([]);
    });

    it('respecte la taille, chevauche le passage précédent et couvre tout le texte', () => {
      const phrases = Array.from(
        { length: 120 },
        (_v, i) => `Phrase numéro ${i} sur la sécurité des jetons JWT et leur rotation.`,
      );
      const texte = phrases.join(' ');
      const passages = decouper(texte, 500, 80);
      expect(passages.length).toBeGreaterThan(10);
      for (const p of passages) expect(p.length).toBeLessThanOrEqual(500);
      for (let i = 1; i < passages.length; i++) {
        // Le début du passage i figure à la fin du passage i-1 (chevauchement).
        const debut = passages[i].slice(0, 20);
        expect(passages[i - 1]).toContain(debut);
      }
      for (const phrase of phrases) {
        expect(passages.some((p) => p.includes(phrase))).toBe(true);
      }
    });

    it('coupe de préférence entre deux paragraphes, puis en fin de phrase', () => {
      const p1 = 'a'.repeat(350);
      const passages = decouper(`${p1}.\n\n${'b '.repeat(200)}`, 500, 50);
      expect(passages[0]).toBe(`${p1}.`);
      const phrases = decouper(`${'mot '.repeat(80)}fin. ${'suite '.repeat(80)}`, 500, 50);
      expect(phrases[0].endsWith('fin.')).toBe(true);
    });

    it('ne coupe jamais au milieu d’un mot quand une espace existe', () => {
      const texte = Array.from({ length: 400 }, (_v, i) => `mot${i}`).join(' ');
      const passages = decouper(texte, 300, 40);
      for (const p of passages) {
        expect(p).toMatch(/^mot\d+/);
        expect(p).toMatch(/mot\d+$/);
      }
    });

    it('progresse toujours, même sans aucune espace', () => {
      const passages = decouper('x'.repeat(5000), 1000, 200);
      expect(passages.length).toBeGreaterThanOrEqual(5);
      expect(passages.every((p) => p.length <= 1000)).toBe(true);
    });

    it('valeurs par défaut : ≈ 512 tokens (2 000 caractères), chevauchement ≈ 50 tokens', () => {
      expect(DECOUPAGE.tailleCaracteres).toBe(2000);
      expect(DECOUPAGE.chevauchementCaracteres).toBe(200);
      const passages = decouper('mot '.repeat(2000));
      expect(passages.every((p) => p.length <= 2000)).toBe(true);
    });
  });
});

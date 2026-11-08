import { BadRequestException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';
import {
  BORNES_GRILLE,
  LIBELLES_NIVEAUX,
  nettoyerNomModele,
  NiveauSaisi,
  normaliserNiveaux,
  PLAGES_PAR_DEFAUT,
  texteOuNull,
  totalPonderations,
  valideeApres,
  verifierGrilleModifiable,
  verifierModeleComplet,
  verifierNombreCriteres,
  verifierPermutation,
  verifierPlafond,
  verifierValidable,
} from './grille.regles';

/** Règles pures de la grille de notation (US-ATEL-02). */
describe('grille.regles (US-ATEL-02)', () => {
  const plages = (...bornes: Array<[number, number]>): NiveauSaisi[] =>
    bornes.map(([pointsMinPct, pointsMaxPct]) => ({ pointsMinPct, pointsMaxPct }));

  describe('totalPonderations', () => {
    it('additionne les pondérations (exemple de l’UC4 : 40 + 30 + 15 + 15 = 100)', () => {
      expect(totalPonderations([40, 30, 15, 15])).toBe(100);
      expect(totalPonderations([])).toBe(0);
    });
  });

  describe('verifierPlafond (ajout / modification : total ≤ 100 %)', () => {
    it('accepte un total inférieur ou ÉGAL à 100 %', () => {
      expect(() => verifierPlafond(0)).not.toThrow();
      expect(() => verifierPlafond(99)).not.toThrow();
      expect(() => verifierPlafond(100)).not.toThrow();
    });

    it('refuse (400) un total de 101 % avec le total dans le message', () => {
      expect(() => verifierPlafond(101)).toThrow(BadRequestException);
      expect(() => verifierPlafond(101)).toThrow(
        'Total des pondérations : 101 % (au-delà de 100 %). Réduisez une pondération.',
      );
      expect(() => verifierPlafond(160)).toThrow(/160 %/);
    });
  });

  describe('verifierValidable (validation : total EXACTEMENT 100 %)', () => {
    it('accepte 100 % avec au moins un critère', () => {
      expect(() => verifierValidable(4, 100)).not.toThrow();
      expect(() => verifierValidable(1, 100)).not.toThrow();
    });

    it.each([
      [3, 99],
      [2, 60],
      [5, 101],
    ])('refuse (400) %i critères à %i %%', (nb, total) => {
      expect(() => verifierValidable(nb, total)).toThrow(
        new BadRequestException(`Total des pondérations = ${total} % (doit être 100 %).`),
      );
    });

    it('refuse (400) une grille vide (0 %)', () => {
      expect(() => verifierValidable(0, 0)).toThrow(
        'Total des pondérations = 0 % (doit être 100 %).',
      );
      // Un total de 100 sans critère est impossible en pratique ; la règle tient quand même.
      expect(() => verifierValidable(0, 100)).toThrow(BadRequestException);
    });
  });

  describe('normaliserNiveaux', () => {
    it('sans saisie : 4 niveaux aux plages par défaut 0–25 / 25–50 / 50–75 / 75–100', () => {
      const niveaux = normaliserNiveaux(undefined);
      expect(niveaux.map((n) => n.libelle)).toEqual([...LIBELLES_NIVEAUX]);
      expect(niveaux.map((n) => [n.pointsMinPct, n.pointsMaxPct])).toEqual(
        PLAGES_PAR_DEFAUT.map((p) => [p.min, p.max]),
      );
      expect(niveaux.map((n) => n.ordre)).toEqual([1, 2, 3, 4]);
      expect(niveaux.every((n) => n.descripteur === null)).toBe(true);
      expect(normaliserNiveaux(null)).toEqual(niveaux);
    });

    it('accepte des plages contiguës choisies, et rogne les descripteurs', () => {
      const niveaux = normaliserNiveaux([
        { pointsMinPct: 0, pointsMaxPct: 40, descripteur: '  Ne démarre pas  ' },
        { pointsMinPct: 40, pointsMaxPct: 60, descripteur: '   ' },
        { pointsMinPct: 60, pointsMaxPct: 85 },
        { pointsMinPct: 85, pointsMaxPct: 100, descripteur: null },
      ]);
      expect(niveaux[0]).toEqual({
        ordre: 1,
        libelle: 'Insuffisant',
        pointsMinPct: 0,
        pointsMaxPct: 40,
        descripteur: 'Ne démarre pas',
      });
      expect(niveaux.map((n) => n.descripteur)).toEqual(['Ne démarre pas', null, null, null]);
    });

    it.each([
      ['3 niveaux', plages([0, 25], [25, 50], [50, 100]), /exactement 4 niveaux/],
      ['5 niveaux', plages([0, 20], [20, 40], [40, 60], [60, 80], [80, 100]), /exactement 4/],
      ['ne commence pas à 0', plages([5, 25], [25, 50], [50, 75], [75, 100]), /commencer à 0 %/],
      ['ne finit pas à 100', plages([0, 25], [25, 50], [50, 75], [75, 95]), /finir à 100 %/],
      [
        'trou entre deux niveaux',
        plages([0, 25], [30, 50], [50, 75], [75, 100]),
        /« Acceptable » doit commencer à 25 %/,
      ],
      [
        'chevauchement',
        plages([0, 25], [20, 50], [50, 75], [75, 100]),
        /sans trou ni chevauchement/,
      ],
      ['plage vide (min = max)', plages([0, 25], [25, 25], [25, 75], [75, 100]), /inférieur/],
      ['plage décroissante', plages([0, 50], [50, 25], [25, 75], [75, 100]), /inférieur/],
      ['hors 0–100', plages([0, 25], [25, 50], [50, 75], [75, 101]), /entre 0 et 100/],
      ['non entier', plages([0, 25.5], [25.5, 50], [50, 75], [75, 100]), /entiers/],
    ])('refuse (400) : %s', (_libelle, saisis, message) => {
      expect(() => normaliserNiveaux(saisis)).toThrow(BadRequestException);
      expect(() => normaliserNiveaux(saisis)).toThrow(message);
    });
  });

  describe('verifierGrilleModifiable', () => {
    it('laisse passer un atelier en brouillon', () => {
      expect(() => verifierGrilleModifiable(StatutAtelier.BROUILLON)).not.toThrow();
    });

    it.each([StatutAtelier.PUBLIE, StatutAtelier.ARCHIVE])('refuse (409) : %s', (statut) => {
      expect(() => verifierGrilleModifiable(statut)).toThrow(
        new ConflictException('La grille ne se modifie que tant que l’atelier est en brouillon.'),
      );
    });
  });

  describe('valideeApres (une modification réelle retire la validation)', () => {
    it.each([
      [true, true, false],
      [true, false, true],
      [false, true, false],
      [false, false, false],
    ])('validée %s, changement %s -> %s', (avant, change, apres) => {
      expect(valideeApres(avant, change)).toBe(apres);
    });
  });

  describe('verifierNombreCriteres', () => {
    it('accepte jusqu’à 20 critères, refuse (400) le 21e', () => {
      expect(() => verifierNombreCriteres(BORNES_GRILLE.criteresMax)).not.toThrow();
      expect(() => verifierNombreCriteres(BORNES_GRILLE.criteresMax + 1)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifierPermutation', () => {
    const ids = ['a', 'b', 'c'];

    it('accepte une permutation exacte', () => {
      expect(() => verifierPermutation(ids, ['c', 'a', 'b'])).not.toThrow();
      expect(() => verifierPermutation(ids, ids)).not.toThrow();
    });

    it.each([
      ['oubli', ['a', 'b']],
      ['doublon', ['a', 'a', 'b']],
      ['intrus', ['a', 'b', 'z']],
      ['de trop', ['a', 'b', 'c', 'z']],
    ])('refuse (400) : %s', (_libelle, demandes) => {
      expect(() => verifierPermutation(ids, demandes)).toThrow(BadRequestException);
    });
  });

  describe('nettoyerNomModele', () => {
    it('rogne et resserre les espaces', () => {
      expect(nettoyerNomModele('  Projet   API  ')).toBe('Projet API');
    });

    it.each(['ab', '   ab   ', 'x'.repeat(121)])('refuse (400) « %s »', (nom) => {
      expect(() => nettoyerNomModele(nom)).toThrow(BadRequestException);
    });
  });

  describe('verifierModeleComplet', () => {
    it('accepte une grille à 100 %, refuse (400) une grille incomplète ou vide', () => {
      expect(() => verifierModeleComplet(4, 100)).not.toThrow();
      expect(() => verifierModeleComplet(2, 70)).toThrow(/= 70 % \(doit être 100 %\)/);
      expect(() => verifierModeleComplet(0, 0)).toThrow(BadRequestException);
    });
  });

  describe('texteOuNull', () => {
    it('rogne, et vide -> null', () => {
      expect(texteOuNull('  a  ')).toBe('a');
      expect(texteOuNull('   ')).toBeNull();
      expect(texteOuNull(null)).toBeNull();
      expect(texteOuNull(undefined)).toBeNull();
    });
  });

  it('la migration reprend les mêmes bornes et les mêmes libellés de niveaux', () => {
    const migration = readFileSync(
      join(__dirname, '../../../database/migrations/1786500000000-AddGrillesNotation.ts'),
      'utf8',
    );
    expect(migration).toContain('"ponderation" BETWEEN 1 AND 100');
    expect(migration).toContain('BETWEEN 3 AND 120');
    expect(migration).toContain('char_length("description") <= 2000');
    expect(migration).toContain('char_length("descripteur") <= 1000');
    LIBELLES_NIVEAUX.forEach((libelle, i) => {
      expect(migration).toContain(`("ordre" = ${i + 1} AND "libelle" = '${libelle}')`);
    });
  });
});

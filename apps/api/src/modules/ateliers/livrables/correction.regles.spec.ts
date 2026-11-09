import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';
import {
  avancement,
  contribution,
  MESSAGE_DEJA_EN_CORRECTION,
  MESSAGE_DEJA_NOTE,
  MESSAGE_PAS_OUVERT,
  nettoyerCommentaireNote,
  scorePondere,
  verifierNotable,
  verifierOuvrable,
  verifierPoints,
} from './correction.regles';

/** Règles pures de la correction (US-ATEL-06). */
describe('correction.regles (US-ATEL-06)', () => {
  const NIVEAUX = [
    { ordre: 1, libelle: 'Insuffisant', pointsMinPct: 0, pointsMaxPct: 25 },
    { ordre: 2, libelle: 'Acceptable', pointsMinPct: 25, pointsMaxPct: 50 },
    { ordre: 3, libelle: 'Bon', pointsMinPct: 50, pointsMaxPct: 75 },
    { ordre: 4, libelle: 'Excellent', pointsMinPct: 75, pointsMaxPct: 100 },
  ];

  describe('verifierOuvrable', () => {
    it('ouvre un livrable SOUMIS', () => {
      expect(() => verifierOuvrable(StatutLivrable.SOUMIS)).not.toThrow();
    });
    it('409 si déjà en correction', () => {
      expect(() => verifierOuvrable(StatutLivrable.EN_CORRECTION)).toThrow(
        new ConflictException(MESSAGE_DEJA_EN_CORRECTION),
      );
    });
    it('409 si déjà noté', () => {
      expect(() => verifierOuvrable(StatutLivrable.NOTE)).toThrow(
        new ConflictException(MESSAGE_DEJA_NOTE),
      );
    });
  });

  describe('verifierNotable', () => {
    it('note un livrable EN_CORRECTION', () => {
      expect(() => verifierNotable(StatutLivrable.EN_CORRECTION)).not.toThrow();
    });
    it('409 si la correction n’est pas ouverte', () => {
      expect(() => verifierNotable(StatutLivrable.SOUMIS)).toThrow(
        new ConflictException(MESSAGE_PAS_OUVERT),
      );
    });
    it('409 si déjà noté', () => {
      expect(() => verifierNotable(StatutLivrable.NOTE)).toThrow(
        new ConflictException(MESSAGE_DEJA_NOTE),
      );
    });
  });

  describe('verifierPoints', () => {
    it.each([
      [3, 50],
      [3, 75],
      [3, 62.5],
      [1, 0],
      [4, 100],
      [2, 33.33],
    ])('niveau %i, %d % : accepté (bornes comprises)', (niveau, points) => {
      expect(verifierPoints(NIVEAUX, niveau, points).ordre).toBe(niveau);
    });

    it.each([
      [3, 49.99],
      [3, 75.01],
      [1, 26],
      [4, 74],
    ])('niveau %i, %d % : hors plage -> 400 avec la plage', (niveau, points) => {
      expect(() => verifierPoints(NIVEAUX, niveau, points)).toThrow(BadRequestException);
    });

    it('message explicite : libellé et plage du niveau', () => {
      expect(() => verifierPoints(NIVEAUX, 3, 80)).toThrow(
        'Niveau « Bon » : les points doivent être compris entre 50 % et 75 % du critère (reçu : 80 %).',
      );
    });

    it('niveau absent du critère -> 400', () => {
      expect(() => verifierPoints(NIVEAUX, 5, 50)).toThrow('Niveau inconnu');
      expect(() => verifierPoints(NIVEAUX.slice(0, 2), 3, 60)).toThrow('Niveau inconnu');
    });

    it.each([[NaN], [Infinity], [62.555]])('points %d -> 400 (format)', (points) => {
      expect(() => verifierPoints(NIVEAUX, 3, points)).toThrow('deux décimales au plus');
    });
  });

  describe('nettoyerCommentaireNote', () => {
    it('rogne ; vide ou absent -> null', () => {
      expect(nettoyerCommentaireNote('  Bien structuré.  ')).toBe('Bien structuré.');
      expect(nettoyerCommentaireNote('   ')).toBeNull();
      expect(nettoyerCommentaireNote(null)).toBeNull();
      expect(nettoyerCommentaireNote(undefined)).toBeNull();
    });
    it('2 000 caractères au plus (après rognage)', () => {
      expect(nettoyerCommentaireNote(` ${'a'.repeat(2000)} `)).toHaveLength(2000);
      expect(() => nettoyerCommentaireNote('a'.repeat(2001))).toThrow(BadRequestException);
    });
  });

  describe('score pondéré', () => {
    it('contribution = points × pondération / 100, au centième', () => {
      expect(contribution(62.5, 40)).toBe(25);
      expect(contribution(33.33, 15)).toBe(5);
      expect(contribution(100, 30)).toBe(30);
    });

    it('somme des contributions, sans erreur d’arrondi cumulée', () => {
      expect(
        scorePondere([
          { pointsPct: 80, ponderation: 40 },
          { pointsPct: 60, ponderation: 30 },
          { pointsPct: 50, ponderation: 15 },
          { pointsPct: 90, ponderation: 15 },
        ]),
      ).toBe(71);
      expect(
        scorePondere([
          { pointsPct: 33.33, ponderation: 50 },
          { pointsPct: 66.67, ponderation: 50 },
        ]),
      ).toBe(50);
      expect(scorePondere([])).toBe(0);
    });

    it('note maximale : 100', () => {
      expect(
        scorePondere([
          { pointsPct: 100, ponderation: 70 },
          { pointsPct: 100, ponderation: 30 },
        ]),
      ).toBe(100);
    });
  });

  describe('avancement', () => {
    it('complet quand chaque critère est noté', () => {
      expect(avancement(4, 4)).toEqual({ notes: 4, total: 4, complete: true });
      expect(avancement(3, 4)).toEqual({ notes: 3, total: 4, complete: false });
      expect(avancement(0, 0)).toEqual({ notes: 0, total: 0, complete: false });
    });
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import {
  EXTENSIONS_LIVRABLE,
  MESSAGE_DATE_PASSEE,
  normaliserTypesLivrables,
  verifierDateLimite,
  verifierModifiable,
} from './atelier.regles';

/**
 * Règles pures d'un atelier (US-ATEL-01). Dates FIXES : jamais l'horloge
 * réelle, le « maintenant » est passé en paramètre comme le fait le service.
 */
describe('atelier.regles (US-ATEL-01)', () => {
  const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');

  describe('verifierDateLimite', () => {
    it('accepte une date limite dans le futur, même d’une milliseconde', () => {
      expect(() =>
        verifierDateLimite(new Date('2026-11-08T10:00:00.001Z'), MAINTENANT),
      ).not.toThrow();
      expect(() => verifierDateLimite(new Date('2027-01-01T00:00:00Z'), MAINTENANT)).not.toThrow();
    });

    it('refuse (400) une date limite passée', () => {
      expect(() => verifierDateLimite(new Date('2026-11-07T10:00:00Z'), MAINTENANT)).toThrow(
        new BadRequestException(MESSAGE_DATE_PASSEE),
      );
    });

    it('refuse (400) une date limite égale à maintenant (borne)', () => {
      expect(() => verifierDateLimite(new Date(MAINTENANT.getTime()), MAINTENANT)).toThrow(
        BadRequestException,
      );
    });

    it('refuse (400) une date invalide', () => {
      expect(() => verifierDateLimite(new Date('pas une date'), MAINTENANT)).toThrow(
        new BadRequestException('La date limite est invalide.'),
      );
    });
  });

  describe('normaliserTypesLivrables', () => {
    it('retire les doublons, met en minuscules et range dans l’ordre de la liste fermée', () => {
      expect(normaliserTypesLivrables(['zip', ' PDF ', 'zip', 'md'])).toEqual(['pdf', 'zip', 'md']);
    });

    it('accepte toute la liste fermée', () => {
      expect(normaliserTypesLivrables([...EXTENSIONS_LIVRABLE].reverse())).toEqual([
        ...EXTENSIONS_LIVRABLE,
      ]);
    });

    it('refuse (400) une extension hors de la liste, en la nommant', () => {
      expect(() => normaliserTypesLivrables(['pdf', 'exe'])).toThrow(
        /Type de livrable non pris en charge : exe\./,
      );
    });

    it('refuse (400) une liste vide', () => {
      expect(() => normaliserTypesLivrables([])).toThrow(
        new BadRequestException('Choisissez au moins un type de livrable.'),
      );
    });
  });

  describe('verifierModifiable', () => {
    it('laisse passer un atelier en brouillon', () => {
      expect(() => verifierModifiable(StatutAtelier.BROUILLON, 'modifier')).not.toThrow();
      expect(() => verifierModifiable(StatutAtelier.BROUILLON, 'supprimer')).not.toThrow();
    });

    it.each([StatutAtelier.PUBLIE, StatutAtelier.ARCHIVE])(
      'refuse (409) de modifier ou supprimer un atelier %s',
      (statut) => {
        expect(() => verifierModifiable(statut, 'modifier')).toThrow(
          new ConflictException('Seul un atelier en brouillon peut être modifié.'),
        );
        expect(() => verifierModifiable(statut, 'supprimer')).toThrow(
          new ConflictException('Seul un atelier en brouillon peut être supprimé.'),
        );
      },
    );
  });
});

import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import {
  MESSAGE_AUCUN_SUPPORT_INDEXE,
  MESSAGE_SUPPORT_HORS_MODULE,
  MESSAGE_SUPPORT_NON_INDEXE,
  nettoyerFocus,
  normaliserTypes,
  verifierQuotaGenerations,
  verifierSupportGenerable,
} from './generation.regles';

describe('generation.regles (US-IA-02)', () => {
  describe('verifierSupportGenerable', () => {
    const indexe = { moduleId: 'm-1', statut: StatutSupport.INDEXE };

    it('accepte un support INDEXE du module', () => {
      expect(() => verifierSupportGenerable(indexe, 'm-1', 1)).not.toThrow();
    });

    it('404 pour un support absent ou d’un autre module', () => {
      expect(() => verifierSupportGenerable(null, 'm-1', 3)).toThrow(
        new NotFoundException(MESSAGE_SUPPORT_HORS_MODULE),
      );
      expect(() => verifierSupportGenerable(indexe, 'm-2', 3)).toThrow(NotFoundException);
    });

    it('409 pour un support non indexé ; invite à indexer s’il n’y en a aucun', () => {
      for (const statut of [StatutSupport.EN_INDEXATION, StatutSupport.ECHEC_INDEXATION]) {
        expect(() => verifierSupportGenerable({ moduleId: 'm-1', statut }, 'm-1', 2)).toThrow(
          new ConflictException(MESSAGE_SUPPORT_NON_INDEXE),
        );
        expect(() => verifierSupportGenerable({ moduleId: 'm-1', statut }, 'm-1', 0)).toThrow(
          new ConflictException(MESSAGE_AUCUN_SUPPORT_INDEXE),
        );
      }
    });
  });

  it('types dans l’ordre de référence, sans doublon', () => {
    expect(normaliserTypes(['VRAI_FAUX', 'QCU', 'QCU'])).toEqual(['QCU', 'VRAI_FAUX']);
  });

  it('thème : espaces réduites, vide -> null, 200 caractères au plus', () => {
    expect(nettoyerFocus('  sécurité   JWT ')).toBe('sécurité JWT');
    expect(nettoyerFocus('   ')).toBeNull();
    expect(nettoyerFocus(undefined)).toBeNull();
    expect(nettoyerFocus('x'.repeat(250))).toHaveLength(200);
  });

  describe('verifierQuotaGenerations', () => {
    it('laisse passer jusqu’au maximum inclus', () => {
      expect(() => verifierQuotaGenerations(10, 10, 100)).not.toThrow();
    });

    it('429 au-delà, avec le délai en minutes (au moins 1)', () => {
      try {
        verifierQuotaGenerations(11, 10, 125);
        fail('429 attendu');
      } catch (erreur) {
        expect(erreur).toBeInstanceOf(HttpException);
        expect((erreur as HttpException).getStatus()).toBe(429);
        expect((erreur as HttpException).message).toBe(
          'Limite de 10 générations par heure atteinte : réessayez dans 3 min.',
        );
      }
      expect(() => verifierQuotaGenerations(2, 1, 0)).toThrow(/réessayez dans 1 min/);
    });
  });
});

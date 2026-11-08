import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import {
  etatDepot,
  MESSAGE_DATE_DEPASSEE_PUBLICATION,
  MESSAGE_GRILLE_NON_VALIDEE,
  verifierPublicationAtelier,
} from './atelier.regles';

/**
 * Règles pures de la publication d'un atelier (US-ATEL-03). Dates FIXES : le
 * « maintenant » est passé en paramètre, comme le fait le service.
 */
describe('atelier.regles — publication (US-ATEL-03)', () => {
  const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');
  const DEMAIN = new Date('2026-11-09T10:00:00.000Z');
  const PUBLIABLE = { statut: StatutAtelier.BROUILLON, grilleValidee: true, dateLimite: DEMAIN };

  describe('verifierPublicationAtelier', () => {
    it('accepte un brouillon à grille validée et date limite future (même d’une milliseconde)', () => {
      expect(() => verifierPublicationAtelier(PUBLIABLE, MAINTENANT)).not.toThrow();
      expect(() =>
        verifierPublicationAtelier(
          { ...PUBLIABLE, dateLimite: new Date(MAINTENANT.getTime() + 1) },
          MAINTENANT,
        ),
      ).not.toThrow();
    });

    it('409 si l’atelier est déjà publié, ou archivé', () => {
      expect(() =>
        verifierPublicationAtelier({ ...PUBLIABLE, statut: StatutAtelier.PUBLIE }, MAINTENANT),
      ).toThrow(new ConflictException('Cet atelier est déjà publié.'));
      expect(() =>
        verifierPublicationAtelier({ ...PUBLIABLE, statut: StatutAtelier.ARCHIVE }, MAINTENANT),
      ).toThrow(new ConflictException('Un atelier archivé ne peut pas être publié.'));
    });

    it('409 si la grille n’est pas validée, ou n’existe pas encore', () => {
      for (const grilleValidee of [false, null]) {
        expect(() =>
          verifierPublicationAtelier({ ...PUBLIABLE, grilleValidee }, MAINTENANT),
        ).toThrow(new ConflictException(MESSAGE_GRILLE_NON_VALIDEE));
      }
    });

    it('400 si la date limite est passée ou égale à maintenant (borne)', () => {
      for (const dateLimite of [new Date('2026-11-01T00:00:00Z'), new Date(MAINTENANT)]) {
        expect(() => verifierPublicationAtelier({ ...PUBLIABLE, dateLimite }, MAINTENANT)).toThrow(
          new BadRequestException(MESSAGE_DATE_DEPASSEE_PUBLICATION),
        );
      }
    });

    it('ordre fixe : le statut passe avant la grille, la grille avant la date', () => {
      const toutFaux = {
        statut: StatutAtelier.PUBLIE,
        grilleValidee: false,
        dateLimite: new Date('2026-01-01T00:00:00Z'),
      };
      expect(() => verifierPublicationAtelier(toutFaux, MAINTENANT)).toThrow(
        'Cet atelier est déjà publié.',
      );
      expect(() =>
        verifierPublicationAtelier({ ...toutFaux, statut: StatutAtelier.BROUILLON }, MAINTENANT),
      ).toThrow(MESSAGE_GRILLE_NON_VALIDEE);
    });
  });

  describe('etatDepot', () => {
    const LIMITE = new Date('2026-11-08T12:00:00.000Z');

    it('OUVERT avant la date limite (exclue)', () => {
      expect(etatDepot(LIMITE, 0, MAINTENANT)).toBe('OUVERT');
      expect(etatDepot(LIMITE, 0, new Date(LIMITE.getTime() - 1))).toBe('OUVERT');
    });

    it('EN_RETARD pendant la tolérance, CLOS ensuite (bornes exactes)', () => {
      expect(etatDepot(LIMITE, 2, LIMITE)).toBe('EN_RETARD');
      expect(etatDepot(LIMITE, 2, new Date(LIMITE.getTime() + 2 * 3_600_000 - 1))).toBe(
        'EN_RETARD',
      );
      expect(etatDepot(LIMITE, 2, new Date(LIMITE.getTime() + 2 * 3_600_000))).toBe('CLOS');
    });

    it('sans tolérance : CLOS dès la date limite ; accepte une date en texte ISO', () => {
      expect(etatDepot(LIMITE, 0, LIMITE)).toBe('CLOS');
      expect(etatDepot(LIMITE.toISOString(), 0, MAINTENANT)).toBe('OUVERT');
    });
  });
});

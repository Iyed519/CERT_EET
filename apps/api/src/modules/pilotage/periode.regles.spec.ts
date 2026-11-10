import {
  JOURS_MAX,
  MESSAGE_DATE_INVALIDE,
  MESSAGE_PERIODE_INVERSEE,
  MESSAGE_PERIODE_TROP_LONGUE,
  PeriodeInvalide,
  arrondi2,
  aujourdhuiInstitution,
  decaler,
  resoudrePeriode,
  taux,
  versJour,
} from './periode.regles';

describe('periode.regles (US-DASH-01)', () => {
  const AUJ = '2026-11-10';

  describe('resoudrePeriode', () => {
    it('par défaut : les 30 derniers jours, aujourd’hui compris', () => {
      expect(resoudrePeriode(AUJ)).toEqual({ du: '2026-10-12', au: AUJ, jours: 30 });
    });

    it('chaînes vides traitées comme absentes', () => {
      expect(resoudrePeriode(AUJ, '', '')).toEqual({ du: '2026-10-12', au: AUJ, jours: 30 });
    });

    it('au seul : 30 jours se terminant à au', () => {
      expect(resoudrePeriode(AUJ, undefined, '2026-03-31')).toEqual({
        du: '2026-03-02',
        au: '2026-03-31',
        jours: 30,
      });
    });

    it('du seul : de du à aujourd’hui', () => {
      expect(resoudrePeriode(AUJ, '2026-11-01')).toEqual({ du: '2026-11-01', au: AUJ, jours: 10 });
    });

    it('du seul dans le futur : période d’un jour (valide, vide)', () => {
      expect(resoudrePeriode(AUJ, '2027-01-05')).toEqual({
        du: '2027-01-05',
        au: '2027-01-05',
        jours: 1,
      });
    });

    it('un seul jour : du = au', () => {
      expect(resoudrePeriode(AUJ, '2026-05-05', '2026-05-05').jours).toBe(1);
    });

    it('période inversée -> refus', () => {
      expect(() => resoudrePeriode(AUJ, '2026-05-06', '2026-05-05')).toThrow(
        new PeriodeInvalide(MESSAGE_PERIODE_INVERSEE),
      );
    });

    it(`exactement ${JOURS_MAX} jours accepté, un de plus refusé`, () => {
      expect(resoudrePeriode(AUJ, '2024-01-01', '2024-12-31').jours).toBe(366);
      expect(() => resoudrePeriode(AUJ, '2024-01-01', '2025-01-01')).toThrow(
        new PeriodeInvalide(MESSAGE_PERIODE_TROP_LONGUE),
      );
    });

    it('date inexistante ou mal formée -> refus', () => {
      for (const [du, au] of [
        ['2026-02-30', undefined],
        [undefined, '2026-13-01'],
        ['2026-1-01', undefined],
        ['hier', undefined],
      ]) {
        expect(() => resoudrePeriode(AUJ, du, au)).toThrow(
          new PeriodeInvalide(MESSAGE_DATE_INVALIDE),
        );
      }
      expect(() => resoudrePeriode('n/a')).toThrow(PeriodeInvalide);
    });

    it('traverse un changement d’année et un 29 février', () => {
      expect(resoudrePeriode(AUJ, '2023-12-31', '2024-03-01').jours).toBe(62);
    });
  });

  describe('outils de dates', () => {
    it('versJour refuse les dates normalisées', () => {
      expect(versJour('2024-02-29')).not.toBeNull();
      expect(versJour('2023-02-29')).toBeNull();
    });

    it('decaler', () => {
      expect(decaler('2026-03-01', -1)).toBe('2026-02-28');
      expect(decaler('2026-12-31', 1)).toBe('2027-01-01');
      expect(() => decaler('x', 1)).toThrow(PeriodeInvalide);
    });

    it('aujourdhuiInstitution : jour de Tunis (UTC+1)', () => {
      expect(aujourdhuiInstitution(new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-10');
      expect(aujourdhuiInstitution(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-09');
    });
  });

  describe('calculs', () => {
    it('arrondi2', () => {
      expect(arrondi2('72.3456')).toBe(72.35);
      expect(arrondi2(null)).toBeNull();
      expect(arrondi2(undefined)).toBeNull();
      expect(arrondi2('abc')).toBeNull();
    });

    it('taux : pourcentage à 1 décimale, 0 si rien', () => {
      expect(taux(1, 3)).toBe(33.3);
      expect(taux(2, 2)).toBe(100);
      expect(taux(0, 0)).toBe(0);
    });
  });
});

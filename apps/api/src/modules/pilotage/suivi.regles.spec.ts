import {
  JOURS_INACTIVITE,
  avancement,
  etatRisque,
  histogramme,
  moyenne,
  plusRecente,
} from './suivi.regles';

describe('suivi.regles (US-SUIVI-01)', () => {
  const MAINTENANT = new Date('2026-11-10T12:00:00Z');
  const jours = (n: number): Date => new Date(MAINTENANT.getTime() - n * 86_400_000);

  describe('etatRisque', () => {
    it(`inactif au-delà de ${JOURS_INACTIVITE} jours sans connexion (inscription en cours)`, () => {
      expect(etatRisque('EN_COURS', jours(8), jours(30), MAINTENANT)).toEqual({
        inactif: true,
        joursSansConnexion: 8,
      });
    });

    it('exactement 7 jours : pas encore inactif', () => {
      expect(etatRisque('EN_COURS', jours(7), jours(30), MAINTENANT).inactif).toBe(false);
    });

    it('jamais connecté : référence = inscription (inscrit récent jamais signalé)', () => {
      expect(etatRisque('EN_COURS', null, jours(2), MAINTENANT)).toEqual({
        inactif: false,
        joursSansConnexion: 2,
      });
      expect(etatRisque('EN_COURS', null, jours(10), MAINTENANT).inactif).toBe(true);
    });

    it('connexion antérieure à l’inscription : référence = inscription', () => {
      expect(etatRisque('EN_COURS', jours(40), jours(3), MAINTENANT)).toEqual({
        inactif: false,
        joursSansConnexion: 3,
      });
    });

    it('inscription terminée ou suspendue : jamais inactive', () => {
      expect(etatRisque('TERMINEE', jours(60), jours(90), MAINTENANT).inactif).toBe(false);
      expect(etatRisque('SUSPENDUE', jours(60), jours(90), MAINTENANT).inactif).toBe(false);
    });

    it('date future : zéro jour', () => {
      expect(etatRisque('EN_COURS', jours(-1), jours(5), MAINTENANT).joursSansConnexion).toBe(0);
    });
  });

  describe('avancement', () => {
    it('évaluations faites / publiées, 1 décimale', () => {
      expect(avancement(1, 2, 1, 1)).toBe(66.7);
      expect(avancement(2, 2, 1, 1)).toBe(100);
    });

    it('aucune évaluation publiée : 0', () => {
      expect(avancement(0, 0, 0, 0)).toBe(0);
    });

    it('borné au nombre publié (évaluation dépubliée entre-temps)', () => {
      expect(avancement(3, 2, 2, 1)).toBe(100);
    });
  });

  it('moyenne : 2 décimales, null si vide', () => {
    expect(moyenne([80, 75, 61])).toBe(72);
    expect(moyenne([1, 2])).toBe(1.5);
    expect(moyenne([10, 10, 11])).toBe(10.33);
    expect(moyenne([])).toBeNull();
  });

  describe('histogramme', () => {
    it('10 tranches ; 100 dans la dernière ; bornes', () => {
      const h = histogramme([0, 9.99, 10, 55, 90, 100, 120, -5]);
      expect(h).toHaveLength(10);
      expect(h[0]).toEqual({ tranche: '0–9', min: 0, max: 9, effectif: 3 });
      expect(h[1].effectif).toBe(1);
      expect(h[5].effectif).toBe(1);
      expect(h[9]).toEqual({ tranche: '90–100', min: 90, max: 100, effectif: 3 });
      expect(h.reduce((s, t) => s + t.effectif, 0)).toBe(8);
    });

    it('vide : toutes les tranches à zéro', () => {
      expect(histogramme([]).every((t) => t.effectif === 0)).toBe(true);
    });
  });

  it('plusRecente', () => {
    expect(plusRecente(null, jours(3), undefined, jours(1), jours(2))).toEqual(jours(1));
    expect(plusRecente()).toBeNull();
  });
});

import { CritereAlerte } from '../../database/enums/critere-alerte.enum';
import {
  HEURES_RETARD_LIVRABLE,
  NoteDatee,
  SUGGESTIONS,
  ateliersEnRetard,
  echecsConsecutifs,
  scoreEnChute,
} from './alertes.regles';

const J = (jour: number): Date => new Date(Date.UTC(2026, 10, jour, 10));
const qcm = (jour: number, valeur: number, reussie: boolean): NoteDatee => ({
  type: 'QCM',
  titre: `QCM ${jour}`,
  valeur,
  date: J(jour),
  reussie,
});
const atelier = (jour: number, valeur: number): NoteDatee => ({
  type: 'ATELIER',
  titre: `Atelier ${jour}`,
  valeur,
  date: J(jour),
});

describe('alertes.regles (US-SUIVI-02)', () => {
  it('une suggestion pour chaque critère', () => {
    for (const c of Object.values(CritereAlerte)) expect(SUGGESTIONS[c].length).toBeGreaterThan(10);
  });

  describe('echecsConsecutifs', () => {
    it('deux derniers QCM en échec (ordre chronologique, quel que soit l’ordre reçu)', () => {
      const r = echecsConsecutifs([qcm(5, 30, false), qcm(1, 90, true), qcm(3, 40, false)]);
      expect(r).toEqual({
        tentatives: [
          { type: 'QCM', titre: 'QCM 3', note: 40, date: J(3).toISOString() },
          { type: 'QCM', titre: 'QCM 5', note: 30, date: J(5).toISOString() },
        ],
      });
    });

    it('un succès en dernier : pas d’alerte', () => {
      expect(
        echecsConsecutifs([qcm(1, 30, false), qcm(2, 35, false), qcm(3, 80, true)]),
      ).toBeNull();
    });

    it('échec, succès, échec : pas consécutifs', () => {
      expect(
        echecsConsecutifs([qcm(1, 30, false), qcm(2, 80, true), qcm(3, 35, false)]),
      ).toBeNull();
    });

    it('un seul échec, ou des ateliers seulement : pas d’alerte', () => {
      expect(echecsConsecutifs([qcm(1, 30, false)])).toBeNull();
      expect(echecsConsecutifs([atelier(1, 10), atelier(2, 5)])).toBeNull();
    });

    it('les ateliers intercalés ne rompent pas la série de QCM', () => {
      expect(
        echecsConsecutifs([qcm(1, 30, false), atelier(2, 90), qcm(3, 20, false)]),
      ).not.toBeNull();
    });

    it('réussite inconnue (null) : pas un échec', () => {
      expect(
        echecsConsecutifs([qcm(1, 30, false), { ...qcm(2, 30, false), reussie: null }]),
      ).toBeNull();
    });
  });

  describe('scoreEnChute', () => {
    it('dernière note ≤ moyenne des précédentes − 20', () => {
      expect(scoreEnChute([qcm(1, 80, true), atelier(2, 90), qcm(3, 65, true)])).toEqual({
        derniere: { type: 'QCM', titre: 'QCM 3', note: 65, date: J(3).toISOString() },
        moyennePrecedentes: 85,
        ecart: 20,
        nbNotes: 3,
      });
    });

    it('baisse de moins de 20 points : pas d’alerte', () => {
      expect(scoreEnChute([qcm(1, 80, true), atelier(2, 90), qcm(3, 65.5, true)])).toBeNull();
    });

    it('moins de 3 notes : pas d’alerte', () => {
      expect(scoreEnChute([qcm(1, 90, true), qcm(2, 10, false)])).toBeNull();
    });

    it('la dernière est la plus récente, pas la dernière reçue', () => {
      expect(scoreEnChute([qcm(3, 90, true), qcm(1, 90, true), qcm(2, 10, false)])).toBeNull();
    });
  });

  describe('ateliersEnRetard', () => {
    const maintenant = new Date('2026-11-10T12:00:00Z');
    const il = (h: number): Date => new Date(maintenant.getTime() - h * 3_600_000);

    it(`non rendu plus de ${HEURES_RETARD_LIVRABLE} h après la date limite`, () => {
      const r = ateliersEnRetard(
        [
          { id: 'b', titre: 'B', dateLimite: il(50) },
          { id: 'a', titre: 'A', dateLimite: il(100) },
        ],
        new Set(),
        maintenant,
      );
      expect(r).toEqual({
        ateliers: [
          { id: 'a', titre: 'A', dateLimite: il(100).toISOString() },
          { id: 'b', titre: 'B', dateLimite: il(50).toISOString() },
        ],
      });
    });

    it('exactement 48 h, ou rendu, ou à venir : pas d’alerte', () => {
      expect(
        ateliersEnRetard([{ id: 'a', titre: 'A', dateLimite: il(48) }], new Set(), maintenant),
      ).toBeNull();
      expect(
        ateliersEnRetard([{ id: 'a', titre: 'A', dateLimite: il(72) }], new Set(['a']), maintenant),
      ).toBeNull();
      expect(
        ateliersEnRetard([{ id: 'a', titre: 'A', dateLimite: il(-5) }], new Set(), maintenant),
      ).toBeNull();
    });
  });
});

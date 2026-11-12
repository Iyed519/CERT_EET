import {
  DonneesInscription,
  VARIABLES,
  calculerVariables,
  debutFormation,
  numeroJour,
} from './risque.variables';

/** Instant au jour `n` de la formation (début le 1er octobre 2026), à l'heure `h` UTC. */
const DEBUT = new Date('2026-10-01T00:00:00Z');
const jour = (n: number, h = 10): Date => new Date(DEBUT.getTime() + n * 86_400_000 + h * 3_600_000);

const base = (modif: Partial<DonneesInscription> = {}): DonneesInscription => ({
  debut: DEBUT,
  dateInscription: jour(-5),
  activites: [],
  ateliers: [],
  remises: [],
  notes: [],
  ...modif,
});

describe('Variables du modèle de risque (mêmes définitions que ml/risque/variables.py)', () => {
  it('respecte l’ordre exact de la fiche du modèle (16 entrées)', () => {
    expect(VARIABLES).toEqual([
      'jours_actifs',
      'taux_jours_actifs',
      'jours_depuis_derniere_activite',
      'jours_actifs_14_derniers',
      'delai_inscription',
      'nb_evaluations_echues',
      'taux_remise',
      'nb_non_rendues',
      'nb_remises_en_retard',
      'nb_notes',
      'score_moyen',
      'nb_echecs',
      'echecs_consecutifs_fin',
      'tendance_score',
      'a_au_moins_une_note',
      'coupure',
    ]);
    const v = calculerVariables(base(), jour(10));
    expect(Object.keys(v ?? {}).sort()).toEqual([...VARIABLES].sort());
  });

  it('numéro du jour : jour 0 = début, négatif avant, entier inférieur', () => {
    expect(numeroJour(jour(0, 0), DEBUT)).toBe(0);
    expect(numeroJour(jour(0, 23), DEBUT)).toBe(0);
    expect(numeroJour(jour(-1, 23), DEBUT)).toBe(-1);
    expect(numeroJour(jour(28, 12), DEBUT)).toBe(28);
  });

  it('début : date_debut à minuit UTC, sinon le jour de l’inscription', () => {
    expect(debutFormation('2026-10-01', jour(-5)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(debutFormation(null, new Date('2026-09-20T15:30:00Z')).toISOString()).toBe(
      '2026-09-20T00:00:00.000Z',
    );
  });

  it('aucune prédiction avant le premier jour entier (J < 1)', () => {
    expect(calculerVariables(base(), jour(0, 20))).toBeNull();
    expect(calculerVariables(base(), jour(-3))).toBeNull();
    expect(calculerVariables(base(), jour(1, 0))).not.toBeNull();
  });

  it('apprenant sans aucune trace : valeurs par défaut de l’entraînement', () => {
    expect(calculerVariables(base(), jour(28))).toEqual({
      jours_actifs: 0,
      taux_jours_actifs: 0,
      jours_depuis_derniere_activite: 28,
      jours_actifs_14_derniers: 0,
      delai_inscription: -5,
      nb_evaluations_echues: 0,
      taux_remise: 1,
      nb_non_rendues: 0,
      nb_remises_en_retard: 0,
      nb_notes: 0,
      score_moyen: null,
      nb_echecs: 0,
      echecs_consecutifs_fin: 0,
      tendance_score: null,
      a_au_moins_une_note: 0,
      coupure: 28,
    });
  });

  describe('activité', () => {
    it('jours distincts avant J ; plusieurs connexions le même jour = un jour actif', () => {
      const activites = [jour(-2), jour(1, 8), jour(1, 18), jour(10), jour(20), jour(27, 23)];
      const v = calculerVariables(base({ activites }), jour(28));
      expect(v?.jours_actifs).toBe(5); // -2, 1, 10, 20, 27
      expect(v?.taux_jours_actifs).toBeCloseTo(4 / 28); // jours ≥ 0 seulement
      expect(v?.jours_actifs_14_derniers).toBe(2); // 20 et 27 (≥ J − 14 = 14)
      expect(v?.jours_depuis_derniere_activite).toBe(1); // 28 − 27
    });

    it('anti-fuite : l’activité du jour J et après est ignorée', () => {
      const v = calculerVariables(base({ activites: [jour(5), jour(28, 1), jour(30)] }), jour(28, 20));
      expect(v?.jours_actifs).toBe(1);
      expect(v?.jours_depuis_derniere_activite).toBe(23);
    });

    it('l’activité antérieure à l’inscription ne compte pas', () => {
      const v = calculerVariables(
        base({ dateInscription: jour(3), activites: [jour(-10), jour(1), jour(3), jour(4)] }),
        jour(10),
      );
      expect(v?.jours_actifs).toBe(2);
      expect(v?.delai_inscription).toBe(3);
    });

    it('ancienneté plafonnée à J (dernière activité avant le début)', () => {
      const v = calculerVariables(base({ activites: [jour(-4)] }), jour(10));
      expect(v?.jours_depuis_derniere_activite).toBe(10);
      expect(v?.taux_jours_actifs).toBe(0);
    });
  });

  describe('remises (ateliers seulement)', () => {
    const ateliers = [
      { id: 'a1', dateLimite: jour(7, 23) },
      { id: 'a2', dateLimite: jour(14, 23) },
      { id: 'a3', dateLimite: jour(21, 23) },
      { id: 'a4', dateLimite: jour(40, 23) }, // échéance future
    ];

    it('échues, rendues, non rendues, en retard', () => {
      const remises = [
        { atelierId: 'a1', date: jour(6) }, // à l'heure
        { atelierId: 'a2', date: jour(16) }, // en retard (jour 16 > jour 14)
        { atelierId: 'a4', date: jour(20) }, // en avance sur une échéance future
      ];
      const v = calculerVariables(base({ ateliers, remises }), jour(28));
      expect(v?.nb_evaluations_echues).toBe(3);
      expect(v?.taux_remise).toBeCloseTo(2 / 3);
      expect(v?.nb_non_rendues).toBe(1); // a3
      expect(v?.nb_remises_en_retard).toBe(1);
    });

    it('une échéance future ne compte ni comme rendue ni comme non rendue', () => {
      const v = calculerVariables(base({ ateliers: [ateliers[3]], remises: [] }), jour(28));
      expect(v?.nb_evaluations_echues).toBe(0);
      expect(v?.nb_non_rendues).toBe(0);
      expect(v?.taux_remise).toBe(1);
    });

    it('le jour de l’échéance n’est pas encore échu ; le retard se compte en jours', () => {
      const v1 = calculerVariables(base({ ateliers: [ateliers[0]] }), jour(7, 23));
      expect(v1?.nb_evaluations_echues).toBe(0);
      // Remise quelques heures après la limite, le même jour : pas de retard (granularité jour)
      const v2 = calculerVariables(
        base({ ateliers: [{ id: 'x', dateLimite: jour(7, 9) }], remises: [{ atelierId: 'x', date: jour(7, 15) }] }),
        jour(10),
      );
      expect(v2?.nb_remises_en_retard).toBe(0);
      expect(v2?.taux_remise).toBe(1);
    });

    it('anti-fuite : une remise faite à partir du jour J est ignorée', () => {
      const v = calculerVariables(
        base({ ateliers: [ateliers[0]], remises: [{ atelierId: 'a1', date: jour(12) }] }),
        jour(10),
      );
      expect(v?.taux_remise).toBe(0);
      expect(v?.nb_non_rendues).toBe(1);
      expect(v?.nb_remises_en_retard).toBe(0);
    });

    it('une remise pour un atelier inconnu (autre formation) est ignorée', () => {
      const v = calculerVariables(base({ remises: [{ atelierId: 'zz', date: jour(3) }] }), jour(10));
      expect(v?.nb_remises_en_retard).toBe(0);
      expect(v?.taux_remise).toBe(1);
    });
  });

  describe('notes (QCM et ateliers corrigés)', () => {
    it('moyenne, échecs (< 40), série finale d’échecs, tendance', () => {
      const notes = [
        { id: 'n1', valeur: 80, date: jour(3) },
        { id: 'n2', valeur: 35, date: jour(9) },
        { id: 'n3', valeur: 60, date: jour(12) },
        { id: 'n4', valeur: 30, date: jour(20) },
        { id: 'n5', valeur: 39.5, date: jour(25) },
      ];
      const v = calculerVariables(base({ notes }), jour(28));
      expect(v?.nb_notes).toBe(5);
      expect(v?.score_moyen).toBeCloseTo(48.9);
      expect(v?.nb_echecs).toBe(3);
      expect(v?.echecs_consecutifs_fin).toBe(2);
      expect(v?.tendance_score).toBeCloseTo(39.5 - (80 + 35 + 60 + 30) / 4);
      expect(v?.a_au_moins_une_note).toBe(1);
    });

    it('ordre chronologique même si les notes arrivent dans le désordre', () => {
      const notes = [
        { id: 'b', valeur: 20, date: jour(5) },
        { id: 'a', valeur: 90, date: jour(2) },
      ];
      const v = calculerVariables(base({ notes }), jour(10));
      expect(v?.tendance_score).toBeCloseTo(-70);
      expect(v?.echecs_consecutifs_fin).toBe(1);
    });

    it('une seule note : moyenne connue, tendance vide ; 40 n’est pas un échec', () => {
      const v = calculerVariables(base({ notes: [{ id: 'a', valeur: 40, date: jour(2) }] }), jour(10));
      expect(v?.score_moyen).toBe(40);
      expect(v?.tendance_score).toBeNull();
      expect(v?.nb_echecs).toBe(0);
    });

    it('anti-fuite : une note connue à partir du jour J est ignorée', () => {
      const v = calculerVariables(
        base({ notes: [{ id: 'a', valeur: 10, date: jour(10, 1) }] }),
        jour(10, 22),
      );
      expect(v?.nb_notes).toBe(0);
      expect(v?.score_moyen).toBeNull();
    });
  });
});

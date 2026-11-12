import { AffichageResultats } from '../../../database/enums/affichage-resultats.enum';
import { Role } from '../../../database/enums/role.enum';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { EtatCorrection, QuestionCorrigee } from '../tentative-correction.regles';
import {
  clotureDe,
  construireLignesRapport,
  corrigeInclus,
  dureeFr,
  nombreFr,
  nomFichierRapport,
  phraseCorrigeAbsent,
  pointsARevoir,
  rapportDisponible,
  reussiteParNiveau,
  syntheseRapport,
} from './rapport-tentative.regles';

/**
 * Tests unitaires des règles du rapport PDF (US-QCM-13) : seule une tentative
 * NOTEE a un rapport ; corrigé selon le rôle et la décision d'US-QCM-09 ;
 * aucune bonne réponse ni explication copiée sans corrigé ; clôture relue
 * dans les dates ; synthèse tirée de la notation.
 */
describe('Règles du rapport de tentative (US-QCM-13)', () => {
  const etat = (surcharge: Partial<EtatCorrection> = {}): EtatCorrection => ({
    mode: AffichageResultats.DIFFERE,
    disponible: false,
    raison: 'correction_differee',
    disponibleLe: new Date('2026-12-01T17:00:00Z'),
    ...surcharge,
  });

  const question = (n: number, surcharge: Partial<QuestionCorrigee> = {}): QuestionCorrigee => ({
    id: `q${n}`,
    enonce: `Énoncé ${n}`,
    type: TypeQuestion.QCU,
    ponderation: 2,
    repondue: true,
    estCorrecte: true,
    pointsObtenus: 2,
    explication: `Explication ${n}`,
    options: [
      { id: `q${n}-a`, texte: `Bonne ${n}`, cochee: true, estCorrecte: true },
      { id: `q${n}-b`, texte: `Fausse ${n}`, cochee: false, estCorrecte: false },
    ],
    ...surcharge,
  });

  describe('rapportDisponible', () => {
    it('NOTEE seulement', () => {
      expect(rapportDisponible(StatutTentative.NOTEE)).toBe(true);
      for (const s of [
        StatutTentative.EN_COURS,
        StatutTentative.SOUMISE,
        StatutTentative.ABANDONNEE_TIMER,
      ]) {
        expect(rapportDisponible(s)).toBe(false);
      }
    });
  });

  describe('corrigeInclus', () => {
    it('formateur et administrateur : toujours, même corrigé indisponible pour l’apprenant', () => {
      expect(corrigeInclus(Role.FORMATEUR, null)).toBe(true);
      expect(corrigeInclus(Role.ADMINISTRATEUR, etat())).toBe(true);
    });
    it('apprenant : exactement la décision d’US-QCM-09', () => {
      expect(corrigeInclus(Role.APPRENANT, etat())).toBe(false);
      expect(corrigeInclus(Role.APPRENANT, etat({ raison: 'tentatives_restantes' }))).toBe(false);
      expect(
        corrigeInclus(Role.APPRENANT, etat({ disponible: true, raison: null, disponibleLe: null })),
      ).toBe(true);
    });
    it('apprenant sans décision : jamais', () => {
      expect(corrigeInclus(Role.APPRENANT, null)).toBe(false);
    });
  });

  describe('clotureDe', () => {
    const limite = new Date('2026-11-12T10:30:00Z');
    it('fin avant l’échéance : soumise', () => {
      expect(clotureDe(new Date('2026-11-12T10:29:59Z'), limite)).toBe('SOUMISE');
    });
    it('fin à l’échéance (dateFin = dateLimite) : temps écoulé', () => {
      expect(clotureDe(new Date(limite), limite)).toBe('TEMPS_ECOULE');
      expect(clotureDe(new Date('2026-11-12T10:31:00Z'), limite)).toBe('TEMPS_ECOULE');
    });
    it('sans date de fin : soumise (cas impossible pour une notée)', () => {
      expect(clotureDe(null, limite)).toBe('SOUMISE');
    });
  });

  describe('construireLignesRapport', () => {
    it('avec corrigé : bonnes réponses et explication, rang dans l’ordre reçu', () => {
      const [l1, l2] = construireLignesRapport([question(1), question(2)], true);
      expect(l1).toEqual({
        rang: 1,
        enonce: 'Énoncé 1',
        type: TypeQuestion.QCU,
        ponderation: 2,
        pointsObtenus: 2,
        repondue: true,
        estCorrecte: true,
        optionsCochees: ['Bonne 1'],
        bonnesReponses: ['Bonne 1'],
        explication: 'Explication 1',
        niveau: null,
      });
      expect(l2.rang).toBe(2);
    });

    it('sans corrigé : AUCUNE bonne réponse ni explication copiée', () => {
      const fausse = question(1, {
        estCorrecte: false,
        pointsObtenus: 0,
        options: [
          { id: 'a', texte: 'Bonne 1', cochee: false, estCorrecte: true },
          { id: 'b', texte: 'Fausse 1', cochee: true, estCorrecte: false },
        ],
      });
      const [l] = construireLignesRapport([fausse], false);
      expect(l.bonnesReponses).toBeNull();
      expect(l.explication).toBeNull();
      expect(l.optionsCochees).toEqual(['Fausse 1']);
      expect(JSON.stringify(l)).not.toContain('Bonne 1');
      expect(JSON.stringify(l)).not.toContain('Explication');
    });

    it('options cochées dans l’ordre tiré ; plusieurs bonnes réponses (QCM)', () => {
      const multiple = question(1, {
        type: TypeQuestion.QCM,
        options: [
          { id: 'c', texte: 'C', cochee: true, estCorrecte: true },
          { id: 'a', texte: 'A', cochee: false, estCorrecte: true },
          { id: 'b', texte: 'B', cochee: true, estCorrecte: false },
        ],
      });
      const [l] = construireLignesRapport([multiple], true);
      expect(l.optionsCochees).toEqual(['C', 'B']);
      expect(l.bonnesReponses).toEqual(['C', 'A']);
    });
  });

  describe('syntheseRapport', () => {
    it('justes, fausses répondues, sans réponse et points, tels que notés', () => {
      const lignes = construireLignesRapport(
        [
          question(1),
          question(2, { estCorrecte: false, pointsObtenus: 0 }),
          question(3, { repondue: false, estCorrecte: false, pointsObtenus: 0, ponderation: 1.5 }),
          question(4, { pointsObtenus: 0.333, ponderation: 1 }),
        ],
        false,
      );
      expect(syntheseRapport(lignes)).toEqual({
        nbQuestions: 4,
        nbJustes: 2,
        nbFausses: 1,
        nbSansReponse: 1,
        pointsObtenus: 2.33,
        pointsPossibles: 6.5,
      });
    });
    it('aucune question', () => {
      expect(syntheseRapport([])).toEqual({
        nbQuestions: 0,
        nbJustes: 0,
        nbFausses: 0,
        nbSansReponse: 0,
        pointsObtenus: 0,
        pointsPossibles: 0,
      });
    });
  });

  describe('points à revoir (US-QCM-13, pour l’apprenant)', () => {
    const lignes = (): ReturnType<typeof construireLignesRapport> =>
      construireLignesRapport(
        [
          question(1),
          question(2, { estCorrecte: false, pointsObtenus: 0.5, ponderation: 2 }),
          question(3, { repondue: false, estCorrecte: false, pointsObtenus: 0, ponderation: 3 }),
          question(4, { estCorrecte: false, pointsObtenus: 0 }),
        ],
        false,
        new Map([
          ['q1', 'DEBUTANT'],
          ['q2', 'AVANCE'],
          ['q3', 'AVANCE'],
        ]),
      );

    it('niveau recopié depuis la carte, null si absent', () => {
      expect(lignes().map((l) => l.niveau)).toEqual(['DEBUTANT', 'AVANCE', 'AVANCE', null]);
    });

    it('pointsARevoir : fausses et sans réponse, dans l’ordre, points perdus ; jamais de bonne réponse', () => {
      const a = pointsARevoir(lignes());
      expect(a).toEqual([
        { rang: 2, enonce: 'Énoncé 2', repondue: true, pointsPerdus: 1.5 },
        { rang: 3, enonce: 'Énoncé 3', repondue: false, pointsPerdus: 3 },
        { rang: 4, enonce: 'Énoncé 4', repondue: true, pointsPerdus: 2 },
      ]);
      expect(JSON.stringify(a)).not.toContain('Bonne');
    });

    it('pointsARevoir : vide quand tout est juste', () => {
      expect(pointsARevoir(construireLignesRapport([question(1), question(2)], true))).toEqual([]);
    });

    it('reussiteParNiveau : niveaux présents, du plus simple au plus avancé, non précisé en dernier', () => {
      expect(reussiteParNiveau(lignes())).toEqual([
        { niveau: 'DEBUTANT', nbJustes: 1, nbQuestions: 1 },
        { niveau: 'AVANCE', nbJustes: 0, nbQuestions: 2 },
        { niveau: null, nbJustes: 0, nbQuestions: 1 },
      ]);
    });

    it('reussiteParNiveau : vide si aucun niveau renseigné ; niveau inconnu gardé avant « non précisé »', () => {
      expect(reussiteParNiveau(construireLignesRapport([question(1)], true))).toEqual([]);
      expect(
        reussiteParNiveau(
          construireLignesRapport(
            [question(1), question(2)],
            true,
            new Map([
              ['q1', 'EXPERT'],
              ['q2', 'INTERMEDIAIRE'],
            ]),
          ),
        ),
      ).toEqual([
        { niveau: 'INTERMEDIAIRE', nbJustes: 1, nbQuestions: 1 },
        { niveau: 'EXPERT', nbJustes: 1, nbQuestions: 1 },
      ]);
    });
  });

  describe('formats', () => {
    it('nombreFr : deux décimales, virgule', () => {
      expect(nombreFr(72.5)).toBe('72,50');
      expect(nombreFr(100)).toBe('100,00');
      expect(nombreFr(0)).toBe('0,00');
      expect(nombreFr(1234.567)).toBe('1 234,57');
    });
    it('dureeFr', () => {
      expect(dureeFr(null)).toBe('—');
      expect(dureeFr(45)).toBe('45 s');
      expect(dureeFr(725)).toBe('12 min 05 s');
      expect(dureeFr(3725)).toBe('1 h 02 min 05 s');
    });
    it('phraseCorrigeAbsent : date de fermeture, selon le motif', () => {
      const date = (d: Date): string => d.toISOString().slice(0, 10);
      expect(phraseCorrigeAbsent(etat(), date)).toBe(
        'Corrigé non inclus : il sera disponible à partir du 2026-12-01 (fermeture du QCM).',
      );
      expect(phraseCorrigeAbsent(etat({ raison: 'tentatives_restantes' }), date)).toContain(
        'après votre dernière tentative, et au plus tard le 2026-12-01',
      );
      expect(phraseCorrigeAbsent(etat({ disponibleLe: null }), date)).toBe('Corrigé non inclus.');
    });
    it('nomFichierRapport : ascii, sans caractère risqué', () => {
      expect(nomFichierRapport('Évaluation « finale » : SQL/NoSQL', 2)).toBe(
        'rapport-evaluation-finale-sql-nosql-tentative-2.pdf',
      );
      expect(nomFichierRapport('"; \r\n', 1)).toBe('rapport-qcm-tentative-1.pdf');
      expect(nomFichierRapport('a'.repeat(100), 1)).toBe(
        `rapport-${'a'.repeat(60)}-tentative-1.pdf`,
      );
    });
  });
});

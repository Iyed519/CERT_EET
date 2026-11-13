import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { ResultatAnalyse } from '../../assistance-ia/analyse-points-faibles/analyse-points-faibles.regles';
import {
  ContenuRapport,
  dateHeureTunis,
  genererPdfRapport,
  texteImprimable,
} from './rapport-tentative-pdf';

/** Rapport PDF (US-QCM-13) : un vrai document, paginé, produit en mémoire. */
describe('genererPdfRapport (US-QCM-13)', () => {
  const ANALYSE: ResultatAnalyse = {
    statut: 'OK',
    source: 'GENEREE',
    analyse: {
      synthese: 'Les bases sont là ; la validation des données reste fragile.',
      axes: [
        {
          notion: 'Validation des requêtes',
          constat: 'Confusion entre CORS et ValidationPipe.',
          conseil: 'Relisez le passage sur les pipes.',
          questions: [1, 3],
        },
      ],
      encouragement: 'Vous y êtes presque.',
      modele: 'claude-sonnet-5-5',
    },
  };
  const contenu = (nbQuestions: number, analyseIa: ResultatAnalyse = ANALYSE): ContenuRapport => ({
    tentativeId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    formationTitre: 'Développement back-end',
    moduleTitre: 'Module 1',
    qcmTitre: 'Évaluation finale',
    apprenant: { prenom: 'Inès', nom: 'Gharbi', email: 'ines@example.com' },
    numero: 1,
    nbTentativesMax: 2,
    dateDebut: new Date('2026-11-12T09:00:00Z'),
    dateFin: new Date('2026-11-12T09:20:00Z'),
    dureeSecondes: 1200,
    cloture: 'SOUMISE',
    score: 72.5,
    scoreMinValidation: 60,
    estReussie: true,
    synthese: {
      nbQuestions,
      nbJustes: nbQuestions,
      nbFausses: 0,
      nbSansReponse: 0,
      pointsObtenus: nbQuestions,
      pointsPossibles: nbQuestions,
    },
    lignes: Array.from({ length: nbQuestions }, (_, i) => ({
      rang: i + 1,
      enonce: `Question ${i + 1} ≤ →`,
      type: TypeQuestion.QCU,
      ponderation: 1,
      pointsObtenus: 1,
      repondue: true,
      estCorrecte: true,
      optionsCochees: ['A'],
      bonnesReponses: ['A'],
      explication: 'Parce que.',
      niveau: null,
    })),
    aRevoir: [{ rang: 2, enonce: 'Une question ratée', repondue: false, pointsPerdus: 1 }],
    parNiveau: [{ niveau: 'AVANCE', nbJustes: 0, nbQuestions: 1 }],
    corrigeAbsent: null,
    analyseIa,
    dateGeneration: new Date('2026-11-12T10:00:00Z'),
  });

  it('produit un PDF avec ses métadonnées', async () => {
    // Une seule question : en-tête, synthèse, analyse IA et détail tiennent sur une page.
    const texte = (await genererPdfRapport(contenu(1))).toString('latin1');
    expect(texte.startsWith('%PDF-')).toBe(true);
    expect(texte.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(texte).toContain('Tentative 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
    expect(texte.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('US-IA-10 : analyse imprimée, ou encadré « indisponible » avec la cause', async () => {
    const ok = await genererPdfRapport(contenu(3));
    const ko = await genererPdfRapport(
      contenu(3, { statut: 'INDISPONIBLE', message: 'Crédit Anthropic épuisé.' }),
    );
    expect(ok.subarray(0, 5).toString()).toBe('%PDF-');
    expect(ko.subarray(0, 5).toString()).toBe('%PDF-');
    expect(ok.equals(ko)).toBe(false);
  });

  it('plusieurs pages quand il y a beaucoup de questions', async () => {
    const texte = (await genererPdfRapport(contenu(40))).toString('latin1');
    expect((texte.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it('texteImprimable : WinAnsi conservé, le reste remplacé', () => {
    expect(texteImprimable('Énoncé ’ « » — œ €')).toBe('Énoncé ’ « » — œ €');
    expect(texteImprimable('a ≤ b → c ✓')).toBe('a <= b -> c v');
    expect(texteImprimable('😀 ٱ')).toBe('? ?');
    expect(texteImprimable('ligne 1\nligne 2')).toBe('ligne 1\nligne 2');
  });

  it('dateHeureTunis : heure de Tunis', () => {
    expect(dateHeureTunis(new Date('2026-11-12T09:05:00Z'))).toBe('12/11/2026 à 10:05');
  });
});

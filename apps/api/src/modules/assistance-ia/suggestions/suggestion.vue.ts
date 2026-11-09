import { SuggestionQuestionIa } from '../../../database/entities/suggestion-question-ia.entity';

/** Une suggestion de question telle que l'expose l'API (US-IA-03, US-IA-04). */
export interface SuggestionVue {
  id: string;
  generationId: string;
  ordre: number;
  enonce: string;
  type: string;
  options: Array<{ texte: string; estCorrecte: boolean }>;
  explication: string | null;
  scoreConfiance: number | null;
  passagesSources: number[];
  statut: string;
  /** Décision (US-IA-04) : question créée, QCM cible, auteur, date, motif. */
  questionId: string | null;
  qcmId: string | null;
  decidePar: string | null;
  dateDecision: Date | null;
  motifRejet: string | null;
}

export function versSuggestionVue(s: SuggestionQuestionIa): SuggestionVue {
  return {
    id: s.id,
    generationId: s.generationId,
    ordre: s.ordre,
    enonce: s.enonce,
    type: s.type,
    options: s.options,
    explication: s.explication,
    scoreConfiance: s.scoreConfiance,
    passagesSources: s.passagesSources,
    statut: s.statut,
    questionId: s.questionId,
    qcmId: s.qcmId,
    decidePar: s.decidePar,
    dateDecision: s.dateDecision,
    motifRejet: s.motifRejet,
  };
}

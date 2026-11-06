/**
 * Règles PURES de la notation d'une tentative (US-QCM-08, DS-02 étape 4) :
 * correction d'une question, score pondéré, réussite, taux d'avancement.
 * Aucune dépendance : testées seules, importables sans import circulaire.
 */

/** Une question du tirage, avec ce qu'il faut pour la corriger. */
export interface QuestionANoter {
  questionId: string;
  ponderation: number;
  // Options correctes de la question (lues en base, jamais transmises au client).
  correctes: ReadonlySet<string>;
}

/** Correction d'une question, écrite sur sa ligne `reponses` si elle existe. */
export interface QuestionCorrigee {
  questionId: string;
  repondue: boolean;
  estCorrecte: boolean;
  pointsObtenus: number;
}

export interface Notation {
  // Pourcentage arrondi à 2 décimales (colonne numeric(5,2)).
  score: number;
  nbQuestions: number;
  nbCorrectes: number;
  questions: QuestionCorrigee[];
}

/** Arrondi à 2 décimales, sans les erreurs de flottant de `toFixed` (1.005 -> 1.01). */
export const arrondir2 = (valeur: number): number =>
  Math.round((valeur + Number.EPSILON) * 100) / 100;

/**
 * Une question est correcte si l'ensemble des options cochées est EXACTEMENT
 * l'ensemble des options correctes (D3, tout ou rien) : pour un QCU ou un
 * Vrai/Faux, la seule option cochée est la bonne ; pour un QCM, toutes les
 * bonnes et aucune autre. Rien de coché n'est jamais correct.
 */
export const estReponseCorrecte = (
  cochees: ReadonlySet<string>,
  correctes: ReadonlySet<string>,
): boolean =>
  cochees.size > 0 &&
  cochees.size === correctes.size &&
  [...cochees].every((id) => correctes.has(id));

/**
 * Score pondéré sur les SEULES questions du tirage (D4) :
 *   score = Σ(pondération × correcte) / Σ(pondération) × 100.
 * Une question sans réponse vaut 0 et compte au dénominateur. Σ(pondération)
 * nulle (impossible : la publication exige une question) -> score 0.
 */
export const noterTentative = (
  questions: QuestionANoter[],
  reponses: ReadonlyMap<string, ReadonlySet<string>>,
): Notation => {
  const corrigees = questions.map((question): QuestionCorrigee => {
    const cochees = reponses.get(question.questionId);
    const estCorrecte = cochees !== undefined && estReponseCorrecte(cochees, question.correctes);
    return {
      questionId: question.questionId,
      repondue: cochees !== undefined && cochees.size > 0,
      estCorrecte,
      pointsObtenus: estCorrecte ? question.ponderation : 0,
    };
  });
  const total = questions.reduce((somme, q) => somme + q.ponderation, 0);
  const obtenus = corrigees.reduce((somme, q) => somme + q.pointsObtenus, 0);
  return {
    score: total > 0 ? arrondir2((obtenus / total) * 100) : 0,
    nbQuestions: questions.length,
    nbCorrectes: corrigees.filter((q) => q.estCorrecte).length,
    questions: corrigees,
  };
};

/** Réussite : score (arrondi) au moins égal au seuil du QCM au moment de la notation (D5). */
export const estReussie = (score: number, scoreMinValidation: number): boolean =>
  score >= scoreMinValidation;

/**
 * Taux d'avancement d'une inscription (D9) : QCM publiés de la formation
 * réussis au moins une fois / QCM publiés × 100, arrondi à 2 décimales. Les
 * ateliers s'y ajouteront au Sprint 4. Aucun QCM publié -> 0.
 */
export const tauxAvancement = (nbQcmReussis: number, nbQcmPublies: number): number =>
  nbQcmPublies > 0 ? arrondir2((Math.min(nbQcmReussis, nbQcmPublies) / nbQcmPublies) * 100) : 0;

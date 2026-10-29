import { randomInt } from 'crypto';
import { QuestionTiree } from '../../database/entities/tentative-qcm.entity';
import { TypeQuestion } from '../../database/enums/type-question.enum';

/**
 * Tirage d'une tentative (US-QCM-06, DS-02 étape 2).
 *
 * Fonctions PURES : elles ne lisent pas la base et ne voient JAMAIS
 * `estCorrecte` — le tirage ne manipule que des identifiants et des ordres de
 * rédaction. Le hasard est injectable pour les tests ; en production c'est
 * `crypto.randomInt`, un générateur cryptographique : l'ordre d'une tentative
 * ne peut pas être prédit à partir des précédentes (décision D3), ce que
 * `Math.random` ne garantit pas.
 */

/** Renvoie un entier uniforme dans [0, max). */
export type Aleatoire = (max: number) => number;

export const aleatoireCrypto: Aleatoire = (max) => randomInt(max);

/** Ce que le tirage connaît d'une question : son identité, son rang, ses options. */
export interface QuestionATirer {
  questionId: string;
  // Position de rédaction dans CE QCM (qcm_questions.ordre).
  ordre: number;
  type: TypeQuestion;
  options: Array<{ id: string; ordre: number }>;
}

/** Les trois réglages de la configuration anti-fraude qui pilotent le tirage. */
export interface ReglagesTirage {
  randomiserQuestions: boolean;
  randomiserOptions: boolean;
  // Null : toutes les questions.
  nbQuestionsTirees: number | null;
}

/**
 * Mélange de Fisher-Yates (Durstenfeld) : chaque permutation a exactement la
 * même probabilité, à condition que `aleatoire` soit uniforme. Renvoie une
 * NOUVELLE liste, l'entrée n'est pas modifiée.
 */
export function melanger<T>(elements: readonly T[], aleatoire: Aleatoire = aleatoireCrypto): T[] {
  const copie = [...elements];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = aleatoire(i + 1);
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

const parOrdre = <T extends { ordre: number }>(a: T, b: T): number => a.ordre - b.ordre;

/**
 * Plan d'une tentative : quelles questions, dans quel ordre, et l'ordre des
 * options de chacune. Il est figé dans `planTirage` à la création (D1).
 *
 *  - Tirage de K parmi N (`nbQuestionsTirees`) : TOUJOURS aléatoire, même
 *    sans mélange des questions ; sans mélange, les K tirées gardent l'ordre
 *    de rédaction (D4). K est plafonné à N par sécurité (D9) — la publication
 *    et le retrait de question garantissent déjà N ≥ K.
 *  - Mélange des options : jamais pour un Vrai/Faux (D5) — « Faux, Vrai »
 *    déroute l'apprenant et ne protège rien.
 */
export function tirerPlan(
  questions: readonly QuestionATirer[],
  reglages: ReglagesTirage,
  aleatoire: Aleatoire = aleatoireCrypto,
): QuestionTiree[] {
  const redaction = [...questions].sort(parOrdre);
  const k =
    reglages.nbQuestionsTirees === null
      ? redaction.length
      : Math.min(reglages.nbQuestionsTirees, redaction.length);

  let retenues: QuestionATirer[];
  if (k < redaction.length) {
    const tirees = melanger(redaction, aleatoire).slice(0, k);
    retenues = reglages.randomiserQuestions ? tirees : tirees.sort(parOrdre);
  } else {
    retenues = reglages.randomiserQuestions ? melanger(redaction, aleatoire) : redaction;
  }

  return retenues.map((question) => {
    const options = [...question.options].sort(parOrdre);
    const melangees =
      reglages.randomiserOptions && question.type !== TypeQuestion.VRAI_FAUX
        ? melanger(options, aleatoire)
        : options;
    return { questionId: question.questionId, optionIds: melangees.map((o) => o.id) };
  });
}

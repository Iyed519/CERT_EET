import { QuestionTiree } from '../../database/entities/tentative-qcm.entity';
import { TypeQuestion } from '../../database/enums/type-question.enum';

/**
 * Règles PURES du passage d'une tentative (US-QCM-07) : enregistrement d'une
 * réponse, échéance, durée effective. Aucune dépendance (ni base, ni Redis) :
 * testées seules, et importables sans risque d'import circulaire.
 */

export const MS_PAR_SECONDE = 1000;

/** Préfixe de la clé Redis de la minuterie d'une tentative (DS-02 : `timer:{tentativeId}`). */
export const PREFIXE_CLE_MINUTERIE = 'timer:';

export const cleMinuterie = (tentativeId: string): string =>
  `${PREFIXE_CLE_MINUTERIE}${tentativeId}`;

// Messages renvoyés à l'apprenant (et vérifiés par les tests).
export const MESSAGE_TENTATIVE_INTROUVABLE = 'Tentative introuvable.';
export const MESSAGE_TENTATIVE_TERMINEE = 'Cette tentative est terminée.';
export const MESSAGE_TEMPS_ECOULE =
  'Le temps est écoulé : vos réponses enregistrées sont conservées.';
export const MESSAGE_QUESTION_HORS_TIRAGE = 'Cette question ne fait pas partie de votre tentative.';
export const MESSAGE_OPTION_HORS_QUESTION = 'Une option choisie n’appartient pas à cette question.';
export const MESSAGE_UNE_SEULE_OPTION = 'Une seule réponse est possible pour cette question.';
export const MESSAGE_TYPE_NON_PRIS_EN_CHARGE = 'Type de question non pris en charge.';

/** Motif d'un refus d'enregistrement (400), renvoyé tel quel dans `raison`. */
export type RaisonRefusReponse =
  | 'question_hors_tirage'
  | 'option_hors_question'
  | 'une_seule_option'
  | 'type_non_pris_en_charge';

export interface RefusReponse {
  raison: RaisonRefusReponse;
  message: string;
}

/** Types dont la réponse est UNE option au plus (bouton radio). */
const TYPES_UNE_OPTION: ReadonlySet<TypeQuestion> = new Set([
  TypeQuestion.QCU,
  TypeQuestion.VRAI_FAUX,
]);

/** Types répondus par des options (les autres arriveront plus tard, D14). */
const TYPES_A_OPTIONS: ReadonlySet<TypeQuestion> = new Set([
  TypeQuestion.QCU,
  TypeQuestion.VRAI_FAUX,
  TypeQuestion.QCM,
]);

/**
 * La question doit appartenir au tirage de CETTE tentative : une autre
 * question du QCM (non tirée) ou d'un autre QCM est refusée. Renvoie la
 * question tirée, ou null.
 */
export const trouverQuestionTiree = (
  plan: QuestionTiree[] | null,
  questionId: string,
): QuestionTiree | null => plan?.find((q) => q.questionId === questionId) ?? null;

/**
 * Contrôle des options choisies pour une question tirée, dans cet ordre :
 *   1. type répondu par des options (REPONSE_COURTE, ASSOCIATION -> refus) ;
 *   2. chaque option appartient à la question ET au tirage ;
 *   3. au plus une option pour un QCU ou un Vrai/Faux.
 * Une liste vide est toujours acceptée : elle efface la réponse (D13).
 */
export const verifierOptions = (
  tiree: QuestionTiree,
  type: TypeQuestion,
  optionIds: string[],
): RefusReponse | null => {
  if (!TYPES_A_OPTIONS.has(type)) {
    return { raison: 'type_non_pris_en_charge', message: MESSAGE_TYPE_NON_PRIS_EN_CHARGE };
  }
  const autorisees = new Set(tiree.optionIds);
  if (optionIds.some((id) => !autorisees.has(id))) {
    return { raison: 'option_hors_question', message: MESSAGE_OPTION_HORS_QUESTION };
  }
  if (TYPES_UNE_OPTION.has(type) && optionIds.length > 1) {
    return { raison: 'une_seule_option', message: MESSAGE_UNE_SEULE_OPTION };
  }
  return null;
};

/**
 * Options rangées dans l'ordre où l'apprenant les voit (ordre du tirage) :
 * la réponse renvoyée ne dépend pas de l'ordre des clics.
 */
export const ordonnerSelonTirage = (tiree: QuestionTiree, optionIds: string[]): string[] => {
  const choisies = new Set(optionIds);
  return tiree.optionIds.filter((id) => choisies.has(id));
};

/** Échéance atteinte : l'instant de l'échéance n'appartient plus au temps de passage. */
export const estEchue = (dateLimite: Date, maintenant: Date): boolean =>
  new Date(dateLimite).getTime() <= new Date(maintenant).getTime();

/** Durée effective en secondes entières (dateFin - dateDebut), jamais négative. */
export const dureeEffectiveSecondes = (dateDebut: Date, dateFin: Date): number =>
  Math.max(
    Math.round((new Date(dateFin).getTime() - new Date(dateDebut).getTime()) / MS_PAR_SECONDE),
    0,
  );

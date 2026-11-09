import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { QuestionDto } from '../../qcm/dto/question.dto';
import { QuestionValidee } from '../../qcm/qcm.service';

/**
 * Règles PURES de la révision humaine (US-IA-04, DS-06 P3, état
 * *SuggestionQuestionIA*). Aucune base, aucun réseau.
 */

export const MESSAGE_SUGGESTION_DECIDEE =
  'Cette suggestion a déjà été traitée : une décision ne se prend qu’une fois.';
export const MESSAGE_QCM_AUTRE_MODULE = 'Le QCM choisi doit appartenir au module de la génération.';

/** Ce qu'une suggestion apporte à une question (contenu proposé par l'IA). */
export interface ContenuSuggestion {
  enonce: string;
  type: string;
  options: Array<{ texte: string; estCorrecte: boolean }>;
  explication: string | null;
}

/**
 * Question telle que l'IA l'a proposée, au format de l'éditeur de QCM : le
 * niveau de la génération devient le niveau de difficulté, la pondération est
 * celle par défaut.
 */
export function questionProposee(suggestion: ContenuSuggestion, niveau: string): QuestionDto {
  return {
    enonce: suggestion.enonce,
    type: suggestion.type as TypeQuestion,
    explication: suggestion.explication ?? undefined,
    niveauDifficulte: niveau as QuestionDto['niveauDifficulte'],
    options: suggestion.options.map((o) => ({ texte: o.texte, estCorrecte: o.estCorrecte })),
  };
}

/**
 * La saisie du formateur diffère-t-elle de la proposition (après
 * normalisation) ? Oui -> MODIFIEE (origine IA_MODIFIEE) ; non -> ACCEPTEE
 * (origine IA). Toute différence compte, y compris l'explication, la
 * pondération ou le niveau : l'origine dit honnêtement qui a écrit la question.
 */
export function estModifiee(proposee: QuestionValidee, saisie: QuestionValidee): boolean {
  return !(
    proposee.enonce === saisie.enonce &&
    proposee.type === saisie.type &&
    Number(proposee.ponderation) === Number(saisie.ponderation) &&
    proposee.explication === saisie.explication &&
    proposee.niveauDifficulte === saisie.niveauDifficulte &&
    proposee.options.length === saisie.options.length &&
    proposee.options.every(
      (o, i) =>
        o.texte === saisie.options[i].texte && o.estCorrecte === saisie.options[i].estCorrecte,
    )
  );
}

/** Motif de rejet nettoyé (espaces réduits) ; null s'il est vide. */
export function nettoyerMotif(motif: string | undefined | null): string | null {
  const propre = (motif ?? '').replace(/\s+/g, ' ').trim();
  return propre.length > 0 ? propre : null;
}

import { ConflictException } from '@nestjs/common';

/**
 * Règles de complétude d'un QCM publié (US-QCM-04).
 *
 * Fonctions pures, dans un fichier à part : QcmService (retrait d'une
 * question) et QcmPublicationService (publication) les partagent sans
 * dépendre l'un de l'autre.
 */

/** Libellé du Backlog (« QCM incomplet pour publication »), suivi du motif précis. */
export const PREFIXE_INCOMPLET = 'QCM incomplet pour publication';

/** Ce que la publication vérifie, lu dans la transaction verrouillée. */
export interface EtatPublication {
  nbQuestions: number;
  configuration: { nbQuestionsTirees: number | null; dateFermeture: Date } | null;
}

/**
 * Un QCM peut-il être publié ? Ordre fixe, un message par règle (409 : c'est
 * l'état du QCM qui bloque, pas la requête) :
 *   1. au moins une question ;
 *   2. une configuration anti-fraude ;
 *   3. tirage ≤ nombre ACTUEL de questions (une question a pu être retirée
 *      depuis la configuration) ;
 *   4. fermeture encore dans le futur (le temps a pu passer depuis).
 */
export function verifierPublication(
  etat: EtatPublication,
  maintenant: Date,
): asserts etat is EtatPublication & {
  configuration: NonNullable<EtatPublication['configuration']>;
} {
  if (etat.nbQuestions === 0) {
    throw new ConflictException(`${PREFIXE_INCOMPLET} : ajoutez au moins une question.`);
  }
  if (!etat.configuration) {
    throw new ConflictException(`${PREFIXE_INCOMPLET} : configurez les paramètres anti-fraude.`);
  }
  const tirage = etat.configuration.nbQuestionsTirees;
  if (tirage !== null && tirage > etat.nbQuestions) {
    throw new ConflictException(
      `${PREFIXE_INCOMPLET} : le tirage prévoit ${tirage} questions, le QCM n’en contient que ${etat.nbQuestions}. Ajoutez des questions ou réduisez le tirage.`,
    );
  }
  if (new Date(etat.configuration.dateFermeture).getTime() <= maintenant.getTime()) {
    throw new ConflictException(
      'La fenêtre d’ouverture de ce QCM est close : repoussez la date de fermeture avant de le publier.',
    );
  }
}

/**
 * Retrait d'une question d'un QCM PUBLIÉ : il doit rester publiable — au
 * moins une question, et au moins autant que le tirage configuré. 409 sinon.
 */
export function verifierRetraitQuestion(
  nbQuestionsApres: number,
  nbQuestionsTirees: number | null,
): void {
  if (nbQuestionsApres === 0) {
    throw new ConflictException('Ce QCM est publié : il doit garder au moins une question.');
  }
  if (nbQuestionsTirees !== null && nbQuestionsApres < nbQuestionsTirees) {
    throw new ConflictException(
      `Ce QCM est publié et tire ${nbQuestionsTirees} questions à chaque tentative : il doit en garder au moins ${nbQuestionsTirees}.`,
    );
  }
}

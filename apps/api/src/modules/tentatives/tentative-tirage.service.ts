import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Question } from '../../database/entities/question.entity';
import { QuestionTiree } from '../../database/entities/tentative-qcm.entity';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { Aleatoire, aleatoireCrypto, QuestionATirer, tirerPlan } from './tentative-tirage.regles';

/**
 * Une question telle que l'apprenant la reçoit pendant le passage
 * (US-QCM-06, décision D6).
 *
 * Liste BLANCHE, construite champ par champ : jamais `estCorrecte`, jamais
 * `explication` (elle trahit la réponse), ni `ponderation` ni
 * `niveauDifficulte`. Le type reste : il dit s'il faut une case à cocher ou
 * un bouton radio.
 */
export interface QuestionPresentee {
  id: string;
  enonce: string;
  type: TypeQuestion;
  options: Array<{ id: string; texte: string }>;
}

/**
 * Tirage et présentation des questions d'une tentative (US-QCM-06).
 *
 * Trois barrières contre la fuite des bonnes réponses : `estCorrecte` en
 * `select: false` sur l'entité ; ici, des `select` explicites qui ne la
 * demandent jamais ; et une vue reconstruite champ par champ. Le test e2e de
 * non-fuite vérifie le résultat sur le trafic réel.
 */
@Injectable()
export class TentativeTirageService {
  // Injectable pour les tests ; crypto.randomInt en production (D3).
  aleatoire: Aleatoire = aleatoireCrypto;

  /**
   * Tire le plan d'une tentative à partir du contenu ACTUEL du QCM. Appelé
   * dans la transaction de démarrage (D1) — ou une seule fois, à la première
   * lecture, pour une tentative créée avant US-QCM-06 (D8).
   */
  async tirer(
    manager: EntityManager,
    qcmId: string,
    configuration: Pick<
      ConfigurationAntiFraude,
      'randomiserQuestions' | 'randomiserOptions' | 'nbQuestionsTirees'
    >,
  ): Promise<QuestionTiree[]> {
    const liens = await manager.find(QcmQuestion, {
      where: { qcmId },
      relations: { question: { options: true } },
      select: {
        id: true,
        ordre: true,
        questionId: true,
        question: { id: true, type: true, options: { id: true, ordre: true } },
      },
    });
    const questions: QuestionATirer[] = liens.map((lien) => ({
      questionId: lien.questionId,
      ordre: lien.ordre,
      type: lien.question.type,
      options: lien.question.options.map((o) => ({ id: o.id, ordre: o.ordre })),
    }));
    return tirerPlan(
      questions,
      {
        randomiserQuestions: configuration.randomiserQuestions,
        randomiserOptions: configuration.randomiserOptions,
        nbQuestionsTirees: configuration.nbQuestionsTirees,
      },
      this.aleatoire,
    );
  }

  /**
   * Questions du plan, dans l'ordre du plan, chacune avec ses options dans
   * l'ordre du plan. Une question ou une option absente du contenu (cas qui ne
   * devrait pas arriver : le QCM est verrouillé dès la première tentative)
   * est ignorée plutôt que de casser la page.
   */
  async presenter(manager: EntityManager, plan: QuestionTiree[]): Promise<QuestionPresentee[]> {
    if (plan.length === 0) return [];
    const questions = await manager.find(Question, {
      where: { id: In(plan.map((q) => q.questionId)) },
      relations: { options: true },
      select: { id: true, enonce: true, type: true, options: { id: true, texte: true } },
    });
    const parId = new Map(questions.map((q) => [q.id, q]));

    const presentees: QuestionPresentee[] = [];
    for (const tiree of plan) {
      const question = parId.get(tiree.questionId);
      if (!question) continue;
      const options = new Map(question.options.map((o) => [o.id, o]));
      presentees.push({
        id: question.id,
        enonce: question.enonce,
        type: question.type,
        options: tiree.optionIds
          .map((id) => options.get(id))
          .filter((o): o is NonNullable<typeof o> => o !== undefined)
          .map((o) => ({ id: o.id, texte: o.texte })),
      });
    }
    return presentees;
  }
}

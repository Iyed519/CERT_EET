import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { Question } from '../../database/entities/question.entity';
import { Reponse } from '../../database/entities/reponse.entity';
import { QuestionTiree, TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import {
  construireCorrection,
  EtatCorrection,
  evaluerCorrection,
  messageCorrection,
  QuestionCorrigee,
  ReponseNotee,
} from './tentative-correction.regles';

/** Corrigé d'une de MES tentatives notées (US-QCM-09). */
export interface CorrectionVue {
  tentativeId: string;
  qcmId: string;
  qcmTitre: string;
  mode: AffichageResultats;
  score: number;
  estReussie: boolean;
  scoreMinValidation: number;
  nbQuestions: number;
  nbCorrectes: number;
  questions: QuestionCorrigee[];
}

const MESSAGE_INTROUVABLE = 'Tentative introuvable.';

/**
 * Corrigé d'une tentative par son apprenant (US-QCM-09).
 *
 * Route à part (D1) : la consultation et la soumission ne portent jamais de
 * bonne réponse ; c'est ici, et seulement ici, qu'elles sortent — une fois la
 * tentative NOTEE et selon le mode du QCM, décidé par le SERVEUR à l'heure de
 * la base. Lecture pure : aucune écriture, aucun audit (D7).
 *
 * Bonnes réponses lues par une requête EXPLICITE sur `options.est_correcte`
 * (colonne `select: false`, jamais chargée ailleurs), comme la notation.
 */
@Injectable()
export class TentativeCorrectionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
  ) {}

  /**
   * État du corrigé d'une tentative (D12) : lu par la consultation pour
   * afficher le bouton ou la date, et par `corriger` avant de révéler quoi
   * que ce soit. `maintenant` vient de PostgreSQL.
   */
  async etat(
    tentative: Pick<TentativeQcm, 'apprenantId' | 'qcmId' | 'statut'>,
    configuration: Pick<
      ConfigurationAntiFraude,
      'affichageResultats' | 'dateFermeture' | 'nbTentativesMax'
    >,
    maintenant: Date,
  ): Promise<EtatCorrection> {
    const [compte] = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS "passees",
              COUNT(*) FILTER (WHERE statut = $3)::int AS "enCours"
         FROM tentatives_qcm
        WHERE apprenant_id = $1 AND qcm_id = $2`,
      [tentative.apprenantId, tentative.qcmId, StatutTentative.EN_COURS],
    )) as Array<{ passees: number; enCours: number }>;
    return evaluerCorrection({
      statut: tentative.statut,
      mode: configuration.affichageResultats,
      maintenant,
      dateFermeture: configuration.dateFermeture,
      nbTentativesMax: configuration.nbTentativesMax,
      nbTentativesPassees: compte.passees,
      tentativeEnCours: compte.enCours > 0,
    });
  }

  /**
   * La tentative d'un AUTRE apprenant donne le même 404 qu'une tentative
   * inconnue. Corrigé indisponible : 409 avec `raison` et `disponibleLe`.
   */
  async corriger(apprenantId: string, tentativeId: string): Promise<CorrectionVue> {
    const tentative = await this.tentativeRepository.findOne({
      where: { id: tentativeId, apprenantId },
      relations: { qcm: { configuration: true } },
    });
    if (!tentative || !tentative.qcm.configuration) {
      throw new NotFoundException(MESSAGE_INTROUVABLE);
    }
    const configuration = tentative.qcm.configuration;
    const [{ maintenant }] = (await this.dataSource.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;

    const etat = await this.etat(tentative, configuration, maintenant);
    if (!etat.disponible && etat.raison !== null) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: messageCorrection(etat.raison),
        raison: etat.raison,
        disponibleLe: etat.disponibleLe,
      });
    }

    const questions = await this.lireCorrection(
      this.dataSource.manager,
      tentative.id,
      tentative.planTirage ?? [],
    );
    return {
      tentativeId: tentative.id,
      qcmId: tentative.qcmId,
      qcmTitre: tentative.qcm.titre,
      mode: configuration.affichageResultats,
      score: tentative.score ?? 0,
      estReussie: tentative.estReussie === true,
      scoreMinValidation: configuration.scoreMinValidation,
      nbQuestions: questions.length,
      nbCorrectes: questions.filter((q) => q.estCorrecte).length,
      questions,
    };
  }

  /** Questions du tirage, bonnes options et réponses notées, assemblées en liste blanche. */
  private async lireCorrection(
    manager: EntityManager,
    tentativeId: string,
    plan: QuestionTiree[],
  ): Promise<QuestionCorrigee[]> {
    if (plan.length === 0) return [];
    const questionIds = plan.map((q) => q.questionId);

    const questions = await manager.find(Question, {
      where: { id: In(questionIds) },
      relations: { options: true },
      select: {
        id: true,
        enonce: true,
        type: true,
        ponderation: true,
        explication: true,
        options: { id: true, texte: true },
      },
    });
    const correctes = (await manager.query(
      `SELECT id FROM options WHERE question_id = ANY($1::uuid[]) AND est_correcte = true`,
      [questionIds],
    )) as Array<{ id: string }>;
    const lignes = await manager.find(Reponse, {
      where: { tentativeId },
      relations: { optionsSelectionnees: true },
      select: {
        id: true,
        questionId: true,
        estCorrecte: true,
        pointsObtenus: true,
        optionsSelectionnees: { reponseId: true, optionId: true },
      },
    });
    const reponses = new Map<string, ReponseNotee>(
      lignes.map((l) => [
        l.questionId,
        {
          estCorrecte: l.estCorrecte,
          pointsObtenus: l.pointsObtenus,
          optionIds: l.optionsSelectionnees.map((o) => o.optionId),
        },
      ]),
    );

    return construireCorrection(
      plan,
      questions.map((q) => ({
        id: q.id,
        enonce: q.enonce,
        type: q.type,
        ponderation: q.ponderation,
        explication: q.explication,
        options: q.options.map((o) => ({ id: o.id, texte: o.texte })),
      })),
      new Set(correctes.map((o) => o.id)),
      reponses,
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { Question } from '../../database/entities/question.entity';
import { Reponse } from '../../database/entities/reponse.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { EligibiliteService } from '../certificats/eligibilite.service';
import { AuditService } from '../audit/audit.service';
import {
  QuestionANoter,
  estReussie as calculerReussite,
  noterTentative,
  tauxAvancement,
} from './tentative-notation.regles';

/** Statuts qu'on peut noter : une tentative terminée, pas encore notée (ET-02). */
export const STATUTS_A_NOTER: readonly StatutTentative[] = [
  StatutTentative.SOUMISE,
  StatutTentative.ABANDONNEE_TIMER,
];

/** Nombre maximal de tentatives notées par un passage de rattrapage. */
export const LOT_RATTRAPAGE = 50;

/** Résultat d'une notation, renvoyé à l'appelant (soumission) et tracé. */
export interface ResultatNotation {
  tentativeId: string;
  score: number;
  estReussie: boolean;
  nbQuestions: number;
  nbCorrectes: number;
}

/** Ce que la transaction a écrit, pour l'audit après COMMIT. */
interface Bilan extends ResultatNotation {
  apprenantId: string;
  qcmId: string;
  statutAvant: StatutTentative;
  scoreMinValidation: number;
  tauxAvancement: number | null;
}

/**
 * Notation d'une tentative par le SERVEUR (US-QCM-08, DS-02 étape 4, ET-02).
 *
 * Appelée juste après chaque clôture (soumission, échéance à la sauvegarde ou
 * au démarrage suivant, balayage), dans SA propre transaction (D2) : si elle
 * échoue, la clôture reste valide et le rattrapage du balayage la reprendra.
 *
 * Sous le verrou de la ligne (`SELECT … FOR UPDATE`), seule une tentative
 * SOUMISE ou ABANDONNEE_TIMER est notée ; une tentative déjà NOTEE renvoie
 * null (jamais de renotation, D6 — et le trigger de la base refuse toute
 * modification d'une ligne NOTEE). Deux notations simultanées passent donc
 * l'une après l'autre : la seconde trouve NOTEE et ne fait rien (D12).
 *
 * Dans la transaction : correction de chaque question du tirage (D3, D4),
 * `estCorrecte` / `pointsObtenus` sur chaque réponse, score et réussite
 * (seuil lu maintenant, D5), passage NOTEE, puis taux d'avancement de
 * l'inscription (D9). Après COMMIT : audit TENTATIVE_NOTEE (D7), puis, si la
 * tentative est réussie, évaluation de l'éligibilité à la certification
 * (US-ATEL-09, au mieux).
 */
@Injectable()
export class TentativeNotationService {
  private readonly logger = new Logger(TentativeNotationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eligibiliteService: EligibiliteService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Note la tentative si elle attend sa note ; null sinon (déjà notée, en
   * cours, inconnue). `acteur` : l'apprenant dont la requête a déclenché la
   * notation, ou null pour le système (balayage, D7).
   */
  async noter(tentativeId: string, acteur: string | null): Promise<ResultatNotation | null> {
    const bilan = await this.dataSource.transaction((manager) =>
      this.noterSousVerrou(manager, tentativeId),
    );
    if (!bilan) return null;
    await this.journaliser(bilan, acteur);
    // US-ATEL-09 : une tentative réussie peut rendre l'apprenant éligible.
    if (bilan.estReussie) {
      const [ligne] = (await this.dataSource.query(
        `SELECT m.formation_id FROM tentatives_qcm t
           JOIN qcm q ON q.id = t.qcm_id JOIN modules m ON m.id = q.module_id
          WHERE t.id = $1`,
        [bilan.tentativeId],
      )) as Array<{ formation_id: string }>;
      if (ligne) {
        await this.eligibiliteService.declencherSansEchec(
          bilan.apprenantId,
          ligne.formation_id,
          'TENTATIVE_NOTEE',
        );
      }
    }
    return {
      tentativeId: bilan.tentativeId,
      score: bilan.score,
      estReussie: bilan.estReussie,
      nbQuestions: bilan.nbQuestions,
      nbCorrectes: bilan.nbCorrectes,
    };
  }

  /**
   * Note, sans jamais lever, juste après une clôture : un échec est
   * journalisé, la tentative reste SOUMISE / ABANDONNEE_TIMER et le
   * rattrapage la notera.
   */
  async noterSansEchec(
    tentativeId: string,
    acteur: string | null,
  ): Promise<ResultatNotation | null> {
    try {
      return await this.noter(tentativeId, acteur);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Notation impossible (tentative ${tentativeId}) : ${detail}`);
      return null;
    }
  }

  /**
   * Rattrapage (appelé par le balayage) : note les tentatives terminées qui
   * attendent encore leur note — échec d'une notation précédente, ou
   * tentatives clôturées avant US-QCM-08. Renvoie les identifiants notés.
   */
  async noterEnAttente(limite = LOT_RATTRAPAGE): Promise<string[]> {
    const enAttente = await this.dataSource.getRepository(TentativeQcm).find({
      where: { statut: In([...STATUTS_A_NOTER]) },
      select: { id: true },
      order: { dateFin: 'ASC' },
      take: limite,
    });
    const notees: string[] = [];
    for (const { id } of enAttente) {
      if (await this.noterSansEchec(id, null)) notees.push(id);
    }
    return notees;
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  private async noterSousVerrou(
    manager: EntityManager,
    tentativeId: string,
  ): Promise<Bilan | null> {
    const tentative = await manager.findOne(TentativeQcm, {
      where: { id: tentativeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tentative || !STATUTS_A_NOTER.includes(tentative.statut)) return null;

    const plan = tentative.planTirage ?? [];
    const questionIds = plan.map((q) => q.questionId);
    const questions = await this.chargerQuestions(manager, questionIds);
    const reponses = await manager.find(Reponse, {
      where: { tentativeId },
      relations: { optionsSelectionnees: true },
      select: {
        id: true,
        questionId: true,
        optionsSelectionnees: { reponseId: true, optionId: true },
      },
    });
    const cochees = new Map(
      reponses.map((r) => [r.questionId, new Set(r.optionsSelectionnees.map((o) => o.optionId))]),
    );

    const notation = noterTentative(questions, cochees);
    const configuration = await manager.findOne(ConfigurationAntiFraude, {
      where: { qcmId: tentative.qcmId },
      select: { id: true, scoreMinValidation: true },
    });
    // Sans configuration (impossible : la publication l'exige), seuil 100 : jamais réussi par défaut.
    const scoreMinValidation = configuration?.scoreMinValidation ?? 100;
    const reussie = calculerReussite(notation.score, scoreMinValidation);

    // Les réponses d'abord, la tentative ensuite : une fois NOTEE, la ligne est figée.
    for (const reponse of reponses) {
      const corrigee = notation.questions.find((q) => q.questionId === reponse.questionId);
      await manager.update(
        Reponse,
        { id: reponse.id },
        {
          estCorrecte: corrigee?.estCorrecte ?? false,
          pointsObtenus: corrigee?.pointsObtenus ?? 0,
        },
      );
    }
    await manager.update(
      TentativeQcm,
      { id: tentative.id },
      { statut: StatutTentative.NOTEE, score: notation.score, estReussie: reussie },
    );

    const taux = await this.mettreAJourAvancement(manager, tentative.apprenantId, tentative.qcmId);

    return {
      tentativeId: tentative.id,
      apprenantId: tentative.apprenantId,
      qcmId: tentative.qcmId,
      statutAvant: tentative.statut,
      score: notation.score,
      estReussie: reussie,
      nbQuestions: notation.nbQuestions,
      nbCorrectes: notation.nbCorrectes,
      scoreMinValidation,
      tauxAvancement: taux,
    };
  }

  /**
   * Questions du tirage, dans l'ordre du plan, avec leur pondération et leurs
   * options correctes (lecture explicite d'`est_correcte`, colonne jamais
   * chargée ailleurs). Une question disparue du contenu compte 0 sur une
   * pondération de 1 : impossible en pratique (le QCM est verrouillé dès la
   * première tentative), mais jamais une note gonflée.
   */
  private async chargerQuestions(
    manager: EntityManager,
    questionIds: string[],
  ): Promise<QuestionANoter[]> {
    if (questionIds.length === 0) return [];
    const lignes = await manager.find(Question, {
      where: { id: In(questionIds) },
      select: { id: true, ponderation: true },
    });
    const ponderations = new Map(lignes.map((q) => [q.id, q.ponderation]));
    const correctes = (await manager.query(
      `SELECT id, question_id AS "questionId"
         FROM options
        WHERE question_id = ANY($1::uuid[]) AND est_correcte = true`,
      [questionIds],
    )) as Array<{ id: string; questionId: string }>;
    return questionIds.map((questionId) => ({
      questionId,
      ponderation: ponderations.get(questionId) ?? 1,
      correctes: new Set(correctes.filter((o) => o.questionId === questionId).map((o) => o.id)),
    }));
  }

  /**
   * Taux d'avancement de l'inscription (D9), sous le verrou de l'inscription :
   * deux notations de la même inscription (deux QCM) ne s'écrasent pas.
   * Null si l'apprenant n'a pas d'inscription à la formation de ce QCM.
   */
  private async mettreAJourAvancement(
    manager: EntityManager,
    apprenantId: string,
    qcmId: string,
  ): Promise<number | null> {
    const [inscription] = (await manager.query(
      `SELECT i.id, i.formation_id AS "formationId"
         FROM inscriptions i
         JOIN modules m ON m.formation_id = i.formation_id
         JOIN qcm q ON q.module_id = m.id
        WHERE q.id = $1 AND i.apprenant_id = $2
        FOR UPDATE OF i`,
      [qcmId, apprenantId],
    )) as Array<{ id: string; formationId: string }>;
    if (!inscription) return null;

    const [compte] = (await manager.query(
      `SELECT COUNT(*)::int AS "publies",
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM tentatives_qcm t
                 WHERE t.qcm_id = q.id AND t.apprenant_id = $2 AND t.est_reussie = true
              ))::int AS "reussis"
         FROM qcm q
         JOIN modules m ON m.id = q.module_id
        WHERE m.formation_id = $1 AND q.statut = 'PUBLIE'`,
      [inscription.formationId, apprenantId],
    )) as Array<{ publies: number; reussis: number }>;
    const taux = tauxAvancement(compte.reussis, compte.publies);
    await manager.query('UPDATE inscriptions SET taux_avancement = $2 WHERE id = $1', [
      inscription.id,
      taux,
    ]);
    return taux;
  }

  /** Audit TENTATIVE_NOTEE « au mieux » : la note est déjà validée. */
  private async journaliser(bilan: Bilan, acteur: string | null): Promise<void> {
    try {
      await this.auditService.record({
        action: 'TENTATIVE_NOTEE',
        acteur,
        cible: bilan.tentativeId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          apprenantId: bilan.apprenantId,
          qcmId: bilan.qcmId,
          statut: { avant: bilan.statutAvant, apres: StatutTentative.NOTEE },
          score: bilan.score,
          estReussie: bilan.estReussie,
          scoreMinValidation: bilan.scoreMinValidation,
          nbQuestions: bilan.nbQuestions,
          nbCorrectes: bilan.nbCorrectes,
          tauxAvancement: bilan.tauxAvancement,
        },
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(
        `Audit TENTATIVE_NOTEE impossible (cible ${bilan.tentativeId}) : ${detail}`,
      );
    }
  }
}

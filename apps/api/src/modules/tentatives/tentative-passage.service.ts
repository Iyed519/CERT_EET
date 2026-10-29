import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Question } from '../../database/entities/question.entity';
import { Reponse } from '../../database/entities/reponse.entity';
import { ReponseOption } from '../../database/entities/reponse-option.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';
import {
  MESSAGE_QUESTION_HORS_TIRAGE,
  MESSAGE_TEMPS_ECOULE,
  MESSAGE_TENTATIVE_INTROUVABLE,
  MESSAGE_TENTATIVE_TERMINEE,
  RefusReponse,
  dureeEffectiveSecondes,
  estEchue,
  ordonnerSelonTirage,
  trouverQuestionTiree,
  verifierOptions,
} from './tentative-passage.regles';

/** Contexte de la requête, pour l'audit. */
export interface ContextePassage {
  adresseIp: string | null;
}

/** Réponse enregistrée, renvoyée au navigateur (D3). */
export interface ReponseEnregistreeVue {
  questionId: string;
  // Options retenues, dans l'ordre où l'apprenant les voit.
  optionIds: string[];
  // Instant de la sauvegarde (horloge de la base) ; null si la réponse a été effacée.
  enregistreeLe: Date | null;
  // Heure du serveur et échéance : le navigateur recale son compte à rebours.
  maintenant: Date;
  dateLimite: Date;
}

/** Tentative soumise (D7) — sans score : la notation arrive avec US-QCM-08. */
export interface TentativeSoumiseVue {
  id: string;
  qcmId: string;
  statut: StatutTentative;
  dateDebut: Date;
  dateLimite: Date;
  dateFin: Date;
  // Secondes.
  dureeEffective: number;
  nbQuestions: number;
  nbReponses: number;
}

/**
 * Ce que la transaction a constaté sur la tentative verrouillée. La décision
 * est prise sous le verrou ; les exceptions sont levées APRÈS le COMMIT, pour
 * qu'une clôture à l'échéance soit validée même si la requête est refusée.
 */
type Etat =
  | { type: 'introuvable' }
  | { type: 'terminee'; statut: StatutTentative }
  | { type: 'expiree'; tentative: TentativeQcm }
  | { type: 'active'; tentative: TentativeQcm; maintenant: Date };

type IssueEnregistrement =
  | Exclude<Etat, { type: 'active' }>
  | { type: 'refus'; refus: RefusReponse }
  | { type: 'enregistree'; vue: ReponseEnregistreeVue };

type IssueSoumission =
  | Exclude<Etat, { type: 'active' }>
  | { type: 'soumise'; tentative: TentativeQcm; nbReponses: number };

/**
 * Passage d'une tentative par son apprenant (US-QCM-07, DS-02 étapes 3 et 4) :
 * enregistrer une réponse, soumettre.
 *
 * Le temps n'est jamais décidé par le navigateur : chaque requête relit la
 * tentative SOUS VERROU (`SELECT … FOR UPDATE`) et compare son échéance à
 * l'horloge de PostgreSQL, lue APRÈS l'obtention du verrou
 * (`clock_timestamp()`, et non `now()` qui date du début de la transaction et
 * vieillirait pendant l'attente du verrou). Une sauvegarde et une soumission
 * simultanées passent donc l'une après l'autre : aucune réponse ne peut être
 * écrite après la fin de la tentative (D9).
 */
@Injectable()
export class TentativePassageService {
  private readonly logger = new Logger(TentativePassageService.name);

  constructor(
    private readonly dataSource: DataSource,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
    private readonly minuterie: TentativeMinuterieService,
  ) {}

  /**
   * Enregistre (remplace) la réponse à une question, dans cet ordre :
   *   1. tentative d'un autre apprenant ou inconnue -> 404 ;
   *   2. tentative terminée -> 409 « terminée » ;
   *   3. échéance atteinte -> clôture ABANDONNEE_TIMER (validée), audit
   *      TENTATIVE_EXPIREE, 409 `temps_ecoule` (D4, D6) ;
   *   4. question hors du tirage de CETTE tentative -> 400 ;
   *   5. options hors de la question ou du tirage, plus d'une option sur un
   *      QCU / Vrai-Faux, type non répondu par options -> 400 ;
   *   6. liste vide -> réponse effacée (D13) ; sinon ligne `reponses` unique
   *      (index UQ_reponses_tentative_question) et options remplacées.
   */
  async enregistrerReponse(
    apprenantId: string,
    tentativeId: string,
    questionId: string,
    optionIds: string[],
    contexte: ContextePassage,
  ): Promise<ReponseEnregistreeVue> {
    const issue = await this.dataSource.transaction(
      async (manager): Promise<IssueEnregistrement> => {
        const etat = await this.lireSousVerrou(manager, apprenantId, tentativeId);
        if (etat.type !== 'active') return etat;
        return this.ecrireReponse(manager, etat.tentative, etat.maintenant, questionId, optionIds);
      },
    );

    switch (issue.type) {
      case 'enregistree':
        // Miroir Redis : recréé s'il a disparu, à la même échéance (D1).
        await this.minuterie.armer(tentativeId, issue.vue.dateLimite);
        return issue.vue;
      case 'refus':
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: issue.refus.message,
          raison: issue.refus.raison,
        });
      default:
        return this.refuserTentativeInactive(issue, apprenantId, contexte, 'sauvegarde');
    }
  }

  /**
   * Soumission manuelle (D7, DS-02 étape 4) : mêmes contrôles 1 à 3, puis
   * SOUMISE, `dateFin` = maintenant, `dureeEffective`. Audit QCM_SOUMIS (nom
   * DS-02), clé Redis supprimée. Le score viendra avec US-QCM-08.
   */
  async soumettre(
    apprenantId: string,
    tentativeId: string,
    contexte: ContextePassage,
  ): Promise<TentativeSoumiseVue> {
    const issue = await this.dataSource.transaction(async (manager): Promise<IssueSoumission> => {
      const etat = await this.lireSousVerrou(manager, apprenantId, tentativeId);
      if (etat.type !== 'active') return etat;
      const { tentative, maintenant } = etat;
      tentative.statut = StatutTentative.SOUMISE;
      tentative.dateFin = maintenant;
      tentative.dureeEffective = dureeEffectiveSecondes(tentative.dateDebut, maintenant);
      await manager.update(
        TentativeQcm,
        { id: tentative.id },
        {
          statut: tentative.statut,
          dateFin: tentative.dateFin,
          dureeEffective: tentative.dureeEffective,
        },
      );
      const nbReponses = await manager.countBy(Reponse, { tentativeId: tentative.id });
      return { type: 'soumise', tentative, nbReponses };
    });

    if (issue.type !== 'soumise') {
      return this.refuserTentativeInactive(issue, apprenantId, contexte, 'soumission');
    }

    const { tentative, nbReponses } = issue;
    const nbQuestions = tentative.planTirage?.length ?? 0;
    // Succès tracé sans try/catch, comme TENTATIVE_DEMARREE : une soumission
    // non tracée ne doit pas passer inaperçue.
    await this.auditService.record({
      action: 'QCM_SOUMIS',
      acteur: apprenantId,
      cible: tentative.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        qcmId: tentative.qcmId,
        statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.SOUMISE },
        dateFin: tentative.dateFin,
        dureeEffective: tentative.dureeEffective,
        nbQuestions,
        nbReponses,
      },
    });
    await this.minuterie.effacer(tentative.id);

    return {
      id: tentative.id,
      qcmId: tentative.qcmId,
      statut: tentative.statut,
      dateDebut: tentative.dateDebut,
      dateLimite: tentative.dateLimite,
      dateFin: tentative.dateFin as Date,
      dureeEffective: tentative.dureeEffective as number,
      nbQuestions,
      nbReponses,
    };
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * Verrouille MA tentative et la classe : introuvable, terminée, expirée
   * (clôturée ici, dans la transaction) ou active. L'instant est lu après le
   * verrou.
   */
  private async lireSousVerrou(
    manager: EntityManager,
    apprenantId: string,
    tentativeId: string,
  ): Promise<Etat> {
    const tentative = await manager.findOne(TentativeQcm, {
      where: { id: tentativeId, apprenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tentative) return { type: 'introuvable' };
    if (tentative.statut !== StatutTentative.EN_COURS) {
      return { type: 'terminee', statut: tentative.statut };
    }

    const [{ maintenant }] = (await manager.query(
      'SELECT clock_timestamp() AS maintenant',
    )) as Array<{ maintenant: Date }>;
    if (!estEchue(tentative.dateLimite, maintenant)) {
      return { type: 'active', tentative, maintenant };
    }

    // Échéance atteinte : clôture à l'échéance, réponses conservées (ET-02, D6).
    tentative.statut = StatutTentative.ABANDONNEE_TIMER;
    tentative.dateFin = tentative.dateLimite;
    tentative.dureeEffective = dureeEffectiveSecondes(tentative.dateDebut, tentative.dateLimite);
    await manager.update(
      TentativeQcm,
      { id: tentative.id },
      {
        statut: tentative.statut,
        dateFin: tentative.dateFin,
        dureeEffective: tentative.dureeEffective,
      },
    );
    return { type: 'expiree', tentative };
  }

  /** Contrôles 4 et 5, puis écriture (6), sous le verrou de la tentative. */
  private async ecrireReponse(
    manager: EntityManager,
    tentative: TentativeQcm,
    maintenant: Date,
    questionId: string,
    optionIds: string[],
  ): Promise<IssueEnregistrement> {
    const tiree = trouverQuestionTiree(tentative.planTirage, questionId);
    const question = tiree
      ? await manager.findOne(Question, {
          where: { id: questionId },
          select: { id: true, type: true },
        })
      : null;
    if (!tiree || !question) {
      return {
        type: 'refus',
        refus: { raison: 'question_hors_tirage', message: MESSAGE_QUESTION_HORS_TIRAGE },
      };
    }
    const refus = verifierOptions(tiree, question.type, optionIds);
    if (refus) return { type: 'refus', refus };

    const retenues = ordonnerSelonTirage(tiree, optionIds);
    const vue = { questionId, optionIds: retenues, maintenant, dateLimite: tentative.dateLimite };

    if (retenues.length === 0) {
      // Réponse effacée : pas de ligne = question sans réponse (D13). CASCADE sur les options.
      await manager.delete(Reponse, { tentativeId: tentative.id, questionId });
      return { type: 'enregistree', vue: { ...vue, enregistreeLe: null } };
    }

    // Une seule ligne par (tentative, question) : insertion, ou mise à jour
    // de l'horodatage si elle existe déjà (index unique, D9).
    const [ligne] = (await manager.query(
      `INSERT INTO reponses (tentative_id, question_id, updated_at)
       VALUES ($1, $2, clock_timestamp())
       ON CONFLICT (tentative_id, question_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
       RETURNING id, updated_at AS "enregistreeLe"`,
      [tentative.id, questionId],
    )) as Array<{ id: string; enregistreeLe: Date }>;
    await manager.delete(ReponseOption, { reponseId: ligne.id });
    await manager.insert(
      ReponseOption,
      retenues.map((optionId) => ({ reponseId: ligne.id, optionId })),
    );
    return { type: 'enregistree', vue: { ...vue, enregistreeLe: ligne.enregistreeLe } };
  }

  /**
   * 404, 409 « terminée » ou 409 `temps_ecoule`. Pour une clôture à
   * l'échéance : audit TENTATIVE_EXPIREE et clé Redis supprimée d'abord.
   */
  private async refuserTentativeInactive(
    issue: Exclude<Etat, { type: 'active' }>,
    apprenantId: string,
    contexte: ContextePassage,
    declencheur: 'sauvegarde' | 'soumission',
  ): Promise<never> {
    if (issue.type === 'introuvable') {
      throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    }
    if (issue.type === 'terminee') {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: MESSAGE_TENTATIVE_TERMINEE,
        raison: 'tentative_terminee',
        statut: issue.statut,
      });
    }

    const { tentative } = issue;
    await this.journaliser({
      action: 'TENTATIVE_EXPIREE',
      acteur: apprenantId,
      cible: tentative.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        qcmId: tentative.qcmId,
        statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.ABANDONNEE_TIMER },
        dateLimite: tentative.dateLimite,
        cause: `echeance_depassee_a_la_${declencheur}`,
      },
    });
    await this.minuterie.effacer(tentative.id);
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: MESSAGE_TEMPS_ECOULE,
      raison: 'temps_ecoule',
      statut: StatutTentative.ABANDONNEE_TIMER,
      dateLimite: tentative.dateLimite,
    });
  }

  /** Audit « au mieux » des clôtures : un échec est journalisé, la réponse ne change pas. */
  private async journaliser(entree: Parameters<AuditService['record']>[0]): Promise<void> {
    try {
      await this.auditService.record(entree);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Audit ${entree.action} impossible (cible ${entree.cible}) : ${detail}`);
    }
  }
}

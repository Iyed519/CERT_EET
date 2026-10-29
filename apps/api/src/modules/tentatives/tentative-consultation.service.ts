import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { QuestionTiree, TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { QuestionPresentee, TentativeTirageService } from './tentative-tirage.service';

/**
 * Une de MES tentatives, telle que la page de passage l'affiche (US-QCM-05,
 * décision D14), avec ses questions tirées (US-QCM-06).
 */
export interface TentativeConsulteeVue {
  id: string;
  qcmId: string;
  qcmTitre: string;
  formationId: string;
  statut: StatutTentative;
  dateDebut: Date;
  dateLimite: Date;
  dateFin: Date | null;
  dureeMaxMinutes: number;
  numero: number;
  nbTentativesMax: number;
  tentativesRestantes: number;
  // Heure du SERVEUR (PostgreSQL) au moment de la réponse : le navigateur en
  // déduit l'écart avec sa propre horloge, et le compte à rebours ne dépend
  // jamais d'une horloge locale fausse ou modifiée (F1).
  maintenant: Date;
  // Nombre de questions du tirage (0 tant qu'aucun tirage n'existe).
  nbQuestions: number;
  // Questions dans l'ordre du tirage, SANS bonne réponse (US-QCM-06, D6).
  // Vide hors du temps de passage : la tentative n'est plus EN_COURS, ou son
  // échéance est atteinte.
  questions: QuestionPresentee[];
}

const MESSAGE_INTROUVABLE = 'Tentative introuvable.';

/**
 * Consultation d'une tentative par son apprenant (US-QCM-05, D14 ;
 * US-QCM-06).
 *
 * Lecture, à une exception près, unique et idempotente (D8) : une tentative
 * EN_COURS créée AVANT US-QCM-06 n'a pas de tirage ; il est fait une seule
 * fois, à la première lecture, sous le verrou de la ligne — deux lectures
 * simultanées ne tirent pas deux plans. Une tentative échue n'est pas
 * clôturée ici (le démarrage suivant s'en charge, D11, puis la minuterie,
 * US-QCM-07).
 */
@Injectable()
export class TentativeConsultationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    private readonly tirageService: TentativeTirageService,
  ) {}

  /**
   * La tentative d'un AUTRE apprenant donne le même 404 qu'une tentative
   * inconnue : son existence n'est pas révélée.
   */
  async consulter(apprenantId: string, tentativeId: string): Promise<TentativeConsulteeVue> {
    const tentative = await this.tentativeRepository.findOne({
      where: { id: tentativeId, apprenantId },
      relations: { qcm: { module: true, configuration: true } },
    });
    if (!tentative || !tentative.qcm.configuration) {
      throw new NotFoundException(MESSAGE_INTROUVABLE);
    }
    const configuration = tentative.qcm.configuration;

    // Rang de la tentative : mes tentatives sur ce QCM commencées avant elle, elle comprise.
    const numero = await this.tentativeRepository.countBy({
      apprenantId,
      qcmId: tentative.qcmId,
      dateDebut: LessThanOrEqual(tentative.dateDebut),
    });
    const [{ maintenant }] = (await this.dataSource.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;

    // Les questions ne sortent que pendant le temps de passage.
    const enPassage =
      tentative.statut === StatutTentative.EN_COURS &&
      new Date(tentative.dateLimite).getTime() > new Date(maintenant).getTime();

    let plan = tentative.planTirage;
    if (enPassage && plan === null) {
      plan = await this.tirerUneFois(tentative.id, configuration);
    }
    const questions =
      enPassage && plan !== null
        ? await this.tirageService.presenter(this.dataSource.manager, plan)
        : [];

    return {
      id: tentative.id,
      qcmId: tentative.qcmId,
      qcmTitre: tentative.qcm.titre,
      formationId: tentative.qcm.module.formationId,
      statut: tentative.statut,
      dateDebut: tentative.dateDebut,
      dateLimite: tentative.dateLimite,
      dateFin: tentative.dateFin,
      dureeMaxMinutes: configuration.dureeMaxMinutes,
      numero,
      nbTentativesMax: configuration.nbTentativesMax,
      tentativesRestantes: Math.max(configuration.nbTentativesMax - numero, 0),
      maintenant,
      nbQuestions: plan?.length ?? 0,
      questions,
    };
  }

  /**
   * Tirage tardif d'une tentative créée avant US-QCM-06 (D8) : ligne
   * verrouillée, plan relu sous le verrou (une lecture concurrente a pu le
   * poser), tiré et enregistré seulement s'il manque encore.
   */
  private tirerUneFois(
    tentativeId: string,
    configuration: ConfigurationAntiFraude,
  ): Promise<QuestionTiree[]> {
    return this.dataSource.transaction(async (manager) => {
      const verrouillee = await manager.findOneOrFail(TentativeQcm, {
        where: { id: tentativeId },
        select: { id: true, qcmId: true, planTirage: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (verrouillee.planTirage !== null) {
        return verrouillee.planTirage;
      }
      const plan = await this.tirageService.tirer(manager, verrouillee.qcmId, configuration);
      await manager.update(TentativeQcm, { id: tentativeId }, { planTirage: plan });
      return plan;
    });
  }
}

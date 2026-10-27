import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';

/**
 * Une de MES tentatives, telle que la page de passage l'affiche (US-QCM-05,
 * décision D14). Aucune question ici : US-QCM-06 les ajoutera à cette vue.
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
}

const MESSAGE_INTROUVABLE = 'Tentative introuvable.';

/**
 * Consultation d'une tentative par son apprenant (US-QCM-05, D14).
 *
 * LECTURE SEULE : un GET n'a pas d'effet de bord (même raison que D1). Une
 * tentative EN_COURS dont l'échéance est passée est renvoyée telle quelle :
 * la page affiche « temps écoulé » d'après `maintenant` ; sa clôture reste
 * faite par le démarrage suivant (D11), puis par la minuterie (US-QCM-07).
 */
@Injectable()
export class TentativeConsultationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
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
    };
  }
}

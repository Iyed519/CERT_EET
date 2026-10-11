import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { verifierPublication } from './qcm-publication.regles';
import { QcmDetailVue, QcmService } from './qcm.service';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/**
 * Publication d'un QCM (US-QCM-04, DS-12 partie 3, UC2 Formateur).
 *
 * Publier rend le QCM visible aux apprenants inscrits (« Mon espace ») ; le
 * passage lui-même reste contrôlé par le serveur au démarrage d'une tentative
 * (fenêtre, tentatives : US-QCM-05).
 */
@Injectable()
export class QcmPublicationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    private readonly formationsService: FormationsService,
    private readonly qcmService: QcmService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Publie un QCM, dans cet ordre :
   *   1. QCM -> 404 ; formation archivée -> 409 ;
   *   2. dans UNE transaction, la ligne du QCM VERROUILLÉE (le retrait
   *      concurrent d'une question attend la fin de la publication, et
   *      inversement) : déjà publié -> 409 ; règles de complétude
   *      (verifierPublication) -> 409 avec le motif précis ;
   *   3. statut PUBLIE ;
   *   4. audit QCM_PUBLIE.
   */
  async publier(
    acteurId: string,
    qcmId: string,
    contexte: Contexte,
    maintenant: Date = new Date(),
  ): Promise<QcmDetailVue> {
    const qcm = await this.qcmRepository.findOne({
      where: { id: qcmId },
      relations: { module: true },
    });
    if (!qcm) {
      throw new NotFoundException('QCM introuvable.');
    }
    await this.formationsService.chargerPourEcriture(qcm.module.formationId);

    const bilan = await this.dataSource.transaction(async (manager) => {
      const verrouille = await manager.findOne(Qcm, {
        where: { id: qcmId },
        select: { id: true, statut: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!verrouille) {
        throw new NotFoundException('QCM introuvable.');
      }
      if (verrouille.statut === StatutQcm.PUBLIE) {
        throw new ConflictException('Ce QCM est déjà publié.');
      }

      const nbQuestions = await manager.countBy(QcmQuestion, { qcmId });
      const configuration = await manager.findOne(ConfigurationAntiFraude, {
        where: { qcmId },
        select: { id: true, nbQuestionsTirees: true, dateOuverture: true, dateFermeture: true },
      });
      const etat = { nbQuestions, configuration };
      verifierPublication(etat, maintenant);

      await manager.update(Qcm, { id: qcmId }, { statut: StatutQcm.PUBLIE });
      return {
        statutAvant: verrouille.statut,
        nbQuestions,
        dateOuverture: etat.configuration.dateOuverture,
        dateFermeture: etat.configuration.dateFermeture,
      };
    });

    await this.auditService.record({
      action: 'QCM_PUBLIE',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        statut: { avant: bilan.statutAvant, apres: StatutQcm.PUBLIE },
        nbQuestions: bilan.nbQuestions,
        dateOuverture: bilan.dateOuverture,
        dateFermeture: bilan.dateFermeture,
      },
    });

    return this.qcmService.detail(qcmId);
  }
}

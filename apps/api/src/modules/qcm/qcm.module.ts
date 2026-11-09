import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Option } from '../../database/entities/option.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { Question } from '../../database/entities/question.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { FormationsModule } from '../formations/formations.module';
import { QcmController } from './qcm.controller';
import { QcmConfigurationService } from './qcm-configuration.service';
import { QcmPublicationService } from './qcm-publication.service';
import { QcmService } from './qcm.service';

/**
 * Module des QCM (US-QCM-01 contenu, US-QCM-03 paramètres anti-fraude,
 * US-QCM-04 publication ; le passage suivra : US-QCM-05 à 08).
 *
 * - Importe FormationsModule : le garde @FormateurDeLaFormation et son
 *   service (US-AUTH-16), et FormationsService.chargerPourEcriture (404 / 409
 *   formation archivée).
 * - forFeature : Qcm, Question, Option, QcmQuestion, ConfigurationAntiFraude
 *   (écriture, US-QCM-03 pour la configuration) ;
 *   TentativeQcm (LECTURE : un QCM avec tentatives est verrouillé) ;
 *   ModuleFormation (LECTURE : module cible d'un nouveau QCM).
 * - AuditService (US-AUTH-12) est @Global.
 */
@Module({
  imports: [
    FormationsModule,
    TypeOrmModule.forFeature([
      Qcm,
      Question,
      Option,
      QcmQuestion,
      TentativeQcm,
      ModuleFormation,
      ConfigurationAntiFraude,
    ]),
  ],
  controllers: [QcmController],
  providers: [QcmService, QcmConfigurationService, QcmPublicationService],
  // US-IA-04 : la révision des suggestions IA ajoute les questions acceptées
  // avec les règles et l'écriture de l'éditeur de QCM.
  exports: [QcmService],
})
export class QcmModule {}

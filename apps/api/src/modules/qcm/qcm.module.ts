import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Option } from '../../database/entities/option.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { Question } from '../../database/entities/question.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { FormationsModule } from '../formations/formations.module';
import { QcmController } from './qcm.controller';
import { QcmService } from './qcm.service';

/**
 * Module des QCM (US-QCM-01 ; configuration, publication et passage
 * suivront : US-QCM-03 à 08).
 *
 * - Importe FormationsModule : le garde @FormateurDeLaFormation et son
 *   service (US-AUTH-16), et FormationsService.chargerPourEcriture (404 / 409
 *   formation archivée).
 * - forFeature : Qcm, Question, Option, QcmQuestion (écriture) ;
 *   TentativeQcm (LECTURE : un QCM avec tentatives est verrouillé) ;
 *   ModuleFormation (LECTURE : module cible d'un nouveau QCM).
 * - AuditService (US-AUTH-12) est @Global.
 */
@Module({
  imports: [
    FormationsModule,
    TypeOrmModule.forFeature([Qcm, Question, Option, QcmQuestion, TentativeQcm, ModuleFormation]),
  ],
  controllers: [QcmController],
  providers: [QcmService],
})
export class QcmModule {}

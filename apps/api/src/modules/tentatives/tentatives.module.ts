import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inscription } from '../../database/entities/inscription.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { TentativeConsultationService } from './tentative-consultation.service';
import { TentativeDemarrageService } from './tentative-demarrage.service';
import { TentativeTirageService } from './tentative-tirage.service';
import { TentativesController } from './tentatives.controller';

/**
 * Module du passage des QCM par l'apprenant (US-QCM-05 démarrage et
 * consultation ; US-QCM-06 tirage des questions ; US-QCM-07 minuterie et
 * US-QCM-08 notation viendront s'y ajouter).
 *
 * Séparé de QcmModule (côté formateur) : aucune dépendance vers lui ni vers
 * FormationsModule, donc aucun risque d'import circulaire.
 * - forFeature : TentativeQcm (écriture) ; Qcm et sa configuration, Inscription
 *   (LECTURE, l'inscription est verrouillée pendant le démarrage). Questions et
 *   options sont lues par l'EntityManager de la transaction (tirage).
 * - AuditService (US-AUTH-12) est @Global.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TentativeQcm, Qcm, Inscription])],
  controllers: [TentativesController],
  providers: [TentativeDemarrageService, TentativeConsultationService, TentativeTirageService],
})
export class TentativesModule {}

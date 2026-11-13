import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TentativeQcm } from '../../../database/entities/tentative-qcm.entity';
import { AnalyseIaModule } from '../../assistance-ia/analyse-points-faibles/analyse-ia.module';
import { FormationsModule } from '../../formations/formations.module';
import { TentativeCorrectionService } from '../tentative-correction.service';
import {
  RapportApprenantController,
  RapportFormateurController,
} from './rapport-tentative.controller';
import { RapportTentativeService } from './rapport-tentative.service';

/**
 * US-QCM-13 — Rapport PDF d'une tentative notée. Module à part, comme
 * l'historique (US-QCM-11) : il a besoin de la garde de formation
 * (FormationsModule), que TentativesModule n'importe pas. Le service du
 * corrigé (sans état) est réutilisé tel quel : une seule règle de
 * disponibilité. AuditService est @Global.
 */
@Module({
  imports: [FormationsModule, AnalyseIaModule, TypeOrmModule.forFeature([TentativeQcm])],
  controllers: [RapportApprenantController, RapportFormateurController],
  providers: [RapportTentativeService, TentativeCorrectionService],
})
export class RapportTentativeModule {}

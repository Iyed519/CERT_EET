import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { AnalyseIaModule } from '../assistance-ia/analyse-points-faibles/analyse-ia.module';
import { TentativeCorrectionService } from '../tentatives/tentative-correction.service';
import { FormationsModule } from '../formations/formations.module';
import { PilotageModule } from '../pilotage/pilotage.module';
import { FileRapportsService } from './file-rapports.service';
import { RapportsController } from './rapports.controller';
import { RapportsService } from './rapports.service';

/**
 * Rapports exportés (épopée E8).
 * US-RPT-01 : rapports de session (formateur affecté ou administrateur),
 * générés par la file BullMQ `rapports`, déposés dans le stockage objet.
 * PilotageModule fournit les agrégats du suivi (US-SUIVI-01) ;
 * FormationsModule le garde @FormateurDeLaFormation.
 */
@Module({
  imports: [
    FormationsModule,
    PilotageModule,
    AnalyseIaModule,
    TypeOrmModule.forFeature([TentativeQcm]),
  ],
  controllers: [RapportsController],
  // US-IA-10 : analyse IA du rapport individuel ; corrigé lu comme le rapport de tentative.
  providers: [FileRapportsService, RapportsService, TentativeCorrectionService],
  exports: [RapportsService],
})
export class RapportsModule {}

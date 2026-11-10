import { Module } from '@nestjs/common';
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
  imports: [FormationsModule, PilotageModule],
  controllers: [RapportsController],
  providers: [FileRapportsService, RapportsService],
  exports: [RapportsService],
})
export class RapportsModule {}

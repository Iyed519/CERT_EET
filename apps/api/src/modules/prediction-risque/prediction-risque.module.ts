import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
import { ClientMlService } from './client-ml.service';
import { PredictionRisqueBalayageService } from './prediction-risque-balayage.service';
import { PredictionRisqueController } from './prediction-risque.controller';
import { PredictionRisqueService } from './prediction-risque.service';

/**
 * IA — Prédiction des apprenants à risque (service ml). Complète le module
 * pilotage (alertes à règles) sans le modifier. FormationsModule fournit le
 * garde @FormateurDeLaFormation.
 */
@Module({
  imports: [FormationsModule],
  controllers: [PredictionRisqueController],
  providers: [ClientMlService, PredictionRisqueService, PredictionRisqueBalayageService],
  exports: [PredictionRisqueService],
})
export class PredictionRisqueModule {}

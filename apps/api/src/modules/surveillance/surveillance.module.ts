import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
import { SurveillanceAlertesController } from './surveillance-alertes.controller';
import { SurveillanceAlertesService } from './surveillance-alertes.service';
import { SurveillanceController } from './surveillance.controller';
import { SurveillanceService } from './surveillance.service';

/**
 * US-QCM-12 — Surveillance webcam par captures. Module à part (comme
 * TentativesModule, sans dépendance vers lui) ; FormationsModule pour
 * l'autorisation par ressource (formateur affecté). Stockage, Redis, audit et
 * configuration sont @Global.
 */
@Module({
  imports: [FormationsModule],
  // US-QCM-15 : alertes de la surveillance par IA (photo du moment de la détection).
  controllers: [SurveillanceController, SurveillanceAlertesController],
  providers: [SurveillanceService, SurveillanceAlertesService],
  exports: [SurveillanceService, SurveillanceAlertesService],
})
export class SurveillanceModule {}

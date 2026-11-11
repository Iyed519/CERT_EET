import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
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
  controllers: [SurveillanceController],
  providers: [SurveillanceService],
  exports: [SurveillanceService],
})
export class SurveillanceModule {}

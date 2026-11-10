import { Module } from '@nestjs/common';
import { TableauDeBordAdminController } from './tableau-de-bord-admin.controller';
import { TableauDeBordService } from './tableau-de-bord.service';

/**
 * Pilotage (épopée E8) : tableaux de bord et indicateurs agrégés.
 * US-DASH-01 : tableau de bord global de l'administrateur.
 */
@Module({
  controllers: [TableauDeBordAdminController],
  providers: [TableauDeBordService],
  exports: [TableauDeBordService],
})
export class PilotageModule {}

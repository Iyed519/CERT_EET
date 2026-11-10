import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
import { SuiviFormateurController } from './suivi-formateur.controller';
import { SuiviFormationService } from './suivi-formation.service';
import { TableauDeBordAdminController } from './tableau-de-bord-admin.controller';
import { TableauDeBordService } from './tableau-de-bord.service';

/**
 * Pilotage (épopée E8) : tableaux de bord et indicateurs agrégés.
 * US-DASH-01 : tableau de bord global de l'administrateur.
 * US-SUIVI-01 : suivi pédagogique d'une formation (formateur affecté) ;
 * FormationsModule fournit le garde @FormateurDeLaFormation.
 */
@Module({
  imports: [FormationsModule],
  controllers: [TableauDeBordAdminController, SuiviFormateurController],
  providers: [TableauDeBordService, SuiviFormationService],
  exports: [TableauDeBordService, SuiviFormationService],
})
export class PilotageModule {}

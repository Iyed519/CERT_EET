import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
import { AlertesBalayageService } from './alertes-balayage.service';
import { AlertesDecrochageService } from './alertes-decrochage.service';
import { AlertesController } from './alertes.controller';
import { SuiviFormateurController } from './suivi-formateur.controller';
import { SuiviFormationService } from './suivi-formation.service';
import { TableauDeBordAdminController } from './tableau-de-bord-admin.controller';
import { TableauDeBordService } from './tableau-de-bord.service';
import { TraitementAlertesService } from './traitement-alertes.service';

/**
 * Pilotage (épopée E8) : tableaux de bord et indicateurs agrégés.
 * US-DASH-01 : tableau de bord global de l'administrateur.
 * US-SUIVI-01 : suivi pédagogique d'une formation (formateur affecté) ;
 * FormationsModule fournit le garde @FormateurDeLaFormation.
 * US-SUIVI-02 : alertes de décrochage (balayage planifié, listes, badge).
 * US-SUIVI-03 : traitement des alertes (action, réouverture, historique).
 */
@Module({
  imports: [FormationsModule],
  controllers: [TableauDeBordAdminController, SuiviFormateurController, AlertesController],
  providers: [
    TableauDeBordService,
    SuiviFormationService,
    AlertesDecrochageService,
    AlertesBalayageService,
    TraitementAlertesService,
  ],
  exports: [TableauDeBordService, SuiviFormationService, AlertesDecrochageService],
})
export class PilotageModule {}

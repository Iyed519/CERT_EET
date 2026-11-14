import { Module } from '@nestjs/common';
import { FormationsModule } from '../formations/formations.module';
import { AlertesBalayageService } from './alertes-balayage.service';
import { AlertesDecrochageService } from './alertes-decrochage.service';
import { AlertesController } from './alertes.controller';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';
import { SuiviFormateurController } from './suivi-formateur.controller';
import { SuiviFormationService } from './suivi-formation.service';
import { TableauDeBordAdminController } from './tableau-de-bord-admin.controller';
import { TableauDeBordFormateurController } from './tableau-de-bord-formateur.controller';
import { TableauDeBordFormateurService } from './tableau-de-bord-formateur.service';
import { TableauDeBordService } from './tableau-de-bord.service';
import { TraitementAlertesService } from './traitement-alertes.service';

/**
 * Pilotage (épopée E8) : tableaux de bord et indicateurs agrégés.
 * US-DASH-01 : tableau de bord global de l'administrateur.
 * US-SUIVI-01 : suivi pédagogique d'une formation (formateur affecté) ;
 * FormationsModule fournit le garde @FormateurDeLaFormation.
 * US-SUIVI-02 : alertes de décrochage (balayage planifié, listes, badge).
 * US-SUIVI-03 : traitement des alertes (action, réouverture, historique).
 * US-DASH-03 : tableau de bord global du formateur (toutes ses formations).
 * US-UX-02 : compteurs du menu latéral et pages d'ensemble du formateur (lecture seule).
 */
@Module({
  imports: [FormationsModule],
  controllers: [
    TableauDeBordAdminController,
    TableauDeBordFormateurController,
    SuiviFormateurController,
    AlertesController,
    NavigationController,
  ],
  providers: [
    TableauDeBordService,
    TableauDeBordFormateurService,
    SuiviFormationService,
    AlertesDecrochageService,
    AlertesBalayageService,
    TraitementAlertesService,
    NavigationService,
  ],
  exports: [TableauDeBordService, SuiviFormationService, AlertesDecrochageService],
})
export class PilotageModule {}

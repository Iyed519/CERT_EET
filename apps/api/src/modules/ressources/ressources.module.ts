import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { FormationsModule } from '../formations/formations.module';
import { InscriptionsModule } from '../inscriptions/inscriptions.module';
import { FichiersRessourcesController } from './fichiers-ressources.controller';
import { FichiersRessourcesService } from './fichiers-ressources.service';
import { RessourcesController } from './ressources.controller';
import { RessourcesService } from './ressources.service';

/**
 * Ressources pédagogiques de module (E2 ; US-FORM-05 liens, US-FORM-06
 * fichiers ; révision v1.5 du Backlog). Côté formateur ici ; côté apprenant,
 * « Mon espace » (InscriptionsModule) les lit directement.
 * Importe FormationsModule (garde @FormateurDeLaFormation, formation
 * archivée -> 409, AutorisationRessourceService) et InscriptionsModule
 * (contrôle d'accès de l'apprenant pour les liens de lecture, US-FORM-06).
 */
@Module({
  imports: [
    FormationsModule,
    InscriptionsModule,
    TypeOrmModule.forFeature([RessourceModule, ModuleFormation]),
  ],
  controllers: [RessourcesController, FichiersRessourcesController],
  providers: [RessourcesService, FichiersRessourcesService],
})
export class RessourcesModule {}

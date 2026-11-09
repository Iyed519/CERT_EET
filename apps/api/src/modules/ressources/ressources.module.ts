import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { FormationsModule } from '../formations/formations.module';
import { RessourcesController } from './ressources.controller';
import { RessourcesService } from './ressources.service';

/**
 * Ressources pédagogiques de module (E2 ; US-FORM-05 liens, US-FORM-06
 * fichiers ; révision v1.5 du Backlog). Côté formateur ici ; côté apprenant,
 * « Mon espace » (InscriptionsModule) les lit directement.
 * Importe FormationsModule : garde @FormateurDeLaFormation et formation
 * archivée -> 409.
 */
@Module({
  imports: [FormationsModule, TypeOrmModule.forFeature([RessourceModule, ModuleFormation])],
  controllers: [RessourcesController],
  providers: [RessourcesService],
})
export class RessourcesModule {}

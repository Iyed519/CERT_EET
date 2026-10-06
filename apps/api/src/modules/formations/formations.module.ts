import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { AdminFormationModulesController } from './admin-formation-modules.controller';
import { AdminFormationsController } from './admin-formations.controller';
import { FormationModulesService } from './formation-modules.service';
import { FormationsController } from './formations.controller';
import { FormationsService } from './formations.service';

/**
 * Module des formations (US-FORM-01).
 *
 * - forFeature : Formation et ModuleFormation (le cœur) ; Inscription et Qcm
 *   en LECTURE seule, pour deux garde-fous — ne pas réduire la capacité sous
 *   le nombre d'inscrits, ne pas supprimer un module qui porte une évaluation.
 * - AuditService est @Global (US-AUTH-12) — pas d'import nécessaire.
 * - Trois contrôleurs : administration des formations et de leurs modules
 *   (écriture, ADMINISTRATEUR) et consultation (lecture, tout utilisateur
 *   authentifié), séparés par préfixe de route et par protection.
 * - FormationsService est exporté : les stories suivantes (affectation d'un
 *   formateur, inscription) s'appuieront sur lui.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Formation, ModuleFormation, Inscription, Qcm])],
  controllers: [
    AdminFormationsController,
    AdminFormationModulesController,
    FormationsController,
  ],
  providers: [FormationsService, FormationModulesService],
  exports: [FormationsService],
})
export class FormationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { User } from '../../database/entities/user.entity';
import { AdminFormationFormateursController } from './admin-formation-formateurs.controller';
import { AdminFormationModulesController } from './admin-formation-modules.controller';
import { AdminFormationsController } from './admin-formations.controller';
import { FormationFormateursService } from './formation-formateurs.service';
import { FormationModulesService } from './formation-modules.service';
import { FormationsController } from './formations.controller';
import { FormationsService } from './formations.service';

/**
 * Module des formations (US-FORM-01, US-FORM-03).
 *
 * - forFeature : Formation et ModuleFormation (le cœur) ; Inscription et Qcm
 *   en LECTURE seule, pour deux garde-fous — ne pas réduire la capacité sous
 *   le nombre d'inscrits, ne pas supprimer un module qui porte une évaluation.
 *   AffectationFormateur (écriture) et User (LECTURE seule : rôle et statut du
 *   compte à affecter) pour US-FORM-03.
 * - AuditService (US-AUTH-12) et MailService (US-CPT-05) sont @Global — pas
 *   d'import nécessaire.
 * - Quatre contrôleurs : administration des formations, de leurs modules et
 *   de leurs formateurs (écriture, ADMINISTRATEUR) et consultation (lecture,
 *   tout utilisateur authentifié), séparés par préfixe de route et par
 *   protection.
 * - FormationsService est exporté : les stories suivantes (inscription,
 *   autorisation par ressource) s'appuieront sur lui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Formation,
      ModuleFormation,
      Inscription,
      Qcm,
      AffectationFormateur,
      User,
    ]),
  ],
  controllers: [
    AdminFormationsController,
    AdminFormationModulesController,
    AdminFormationFormateursController,
    FormationsController,
  ],
  providers: [FormationsService, FormationModulesService, FormationFormateursService],
  exports: [FormationsService],
})
export class FormationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { SupportPedagogique } from '../../database/entities/support-pedagogique.entity';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { User } from '../../database/entities/user.entity';
import { AdminFormationFormateursController } from './admin-formation-formateurs.controller';
import { AdminFormationModulesController } from './admin-formation-modules.controller';
import { AdminFormationsController } from './admin-formations.controller';
import { AutorisationRessourceService } from './autorisation/autorisation-ressource.service';
import { FormateurDeLaFormationGuard } from './autorisation/formateur-de-la-formation.guard';
import { FormateurFormationsController } from './formateur-formations.controller';
import { FormateurFormationsService } from './formateur-formations.service';
import { FormationFormateursService } from './formation-formateurs.service';
import { FormationModulesService } from './formation-modules.service';
import { FormationsController } from './formations.controller';
import { FormationsService } from './formations.service';

/**
 * Module des formations (US-FORM-01, US-FORM-03, US-AUTH-16).
 *
 * - forFeature : Formation et ModuleFormation (le cœur) ; Inscription, Qcm et
 *   Atelier (US-ATEL-01) en LECTURE seule, pour deux garde-fous — ne pas réduire la capacité sous
 *   le nombre d'inscrits, ne pas supprimer un module qui porte une évaluation.
 *   AffectationFormateur (écriture) et User (LECTURE seule : rôle et statut du
 *   compte à affecter) pour US-FORM-03.
 * - AuditService (US-AUTH-12) et MailService (US-CPT-05) sont @Global — pas
 *   d'import nécessaire.
 * - Cinq contrôleurs : administration des formations, de leurs modules et
 *   de leurs formateurs (écriture, ADMINISTRATEUR), consultation du catalogue
 *   (tout utilisateur authentifié) et espace formateur « Mes formations »,
 *   séparés par préfixe de route et par protection.
 * - Autorisation par ressource (US-AUTH-16) : AutorisationRessourceService et
 *   le garde de @FormateurDeLaFormation sont EXPORTÉS. Un module qui pose ce
 *   décorateur sur ses routes (QCM, US-QCM-01) importe FormationsModule.
 * - FormationsService est exporté pour les stories suivantes (inscription).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Formation,
      ModuleFormation,
      Inscription,
      Qcm,
      Atelier,
      Livrable,
      SupportPedagogique,
      AffectationFormateur,
      User,
    ]),
  ],
  controllers: [
    AdminFormationsController,
    AdminFormationModulesController,
    AdminFormationFormateursController,
    FormationsController,
    FormateurFormationsController,
  ],
  providers: [
    FormationsService,
    FormationModulesService,
    FormationFormateursService,
    FormateurFormationsService,
    AutorisationRessourceService,
    FormateurDeLaFormationGuard,
  ],
  exports: [FormationsService, AutorisationRessourceService, FormateurDeLaFormationGuard],
})
export class FormationsModule {}

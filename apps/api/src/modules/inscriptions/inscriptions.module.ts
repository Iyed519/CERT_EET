import { CertificatsModule } from '../certificats/certificats.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { User } from '../../database/entities/user.entity';
import { AdminInscriptionsController } from './admin/admin-inscriptions.controller';
import { AdminInscriptionsService } from './admin/admin-inscriptions.service';
import { DesinscriptionService } from './desinscription/desinscription.service';
import { EspaceFormationService } from './espace-formation.service';
import { InscriptionsController } from './inscriptions.controller';
import { InscriptionsService } from './inscriptions.service';

/**
 * Module des inscriptions (US-INSC-01, US-INSC-04 ; US-INSC-02 : gestion
 * par l'administrateur — liste, ajout, suspension, réactivation, import CSV ;
 * US-INSC-03 : désinscription par l'apprenant).
 *
 * - forFeature : Inscription (écriture) ; User (LECTURE : email et prénom
 *   pour l'email de bienvenue) ; Formation, Qcm, TentativeQcm, Atelier, Livrable
 *   (LECTURE : « mon espace », US-INSC-04, US-ATEL-03 et US-ATEL-04),
 *   RessourceModule (LECTURE : ressources du cours, US-FORM-05). Pendant l'inscription, la formation est lue
 *   dans la transaction, via l'EntityManager, avec un verrou.
 * - AuditService (US-AUTH-12) et MailService (US-CPT-05) sont @Global.
 */
@Module({
  imports: [
    CertificatsModule,
    TypeOrmModule.forFeature([
      Inscription,
      User,
      Formation,
      Qcm,
      TentativeQcm,
      Atelier,
      Livrable,
      RessourceModule,
    ]),
  ],
  controllers: [InscriptionsController, AdminInscriptionsController],
  providers: [AdminInscriptionsService, DesinscriptionService, InscriptionsService, EspaceFormationService],
  // US-ATEL-03 : la fiche d'un atelier côté apprenant réutilise le contrôle d'accès.
  exports: [EspaceFormationService],
})
export class InscriptionsModule {}

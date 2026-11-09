import { CertificatsModule } from '../certificats/certificats.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { User } from '../../database/entities/user.entity';
import { EspaceFormationService } from './espace-formation.service';
import { InscriptionsController } from './inscriptions.controller';
import { InscriptionsService } from './inscriptions.service';

/**
 * Module des inscriptions (US-INSC-01, US-INSC-04 ; la désinscription
 * suivra).
 *
 * - forFeature : Inscription (écriture) ; User (LECTURE : email et prénom
 *   pour l'email de bienvenue) ; Formation, Qcm, TentativeQcm, Atelier, Livrable
 *   (LECTURE : « mon espace », US-INSC-04, US-ATEL-03 et US-ATEL-04). Pendant l'inscription, la formation est lue
 *   dans la transaction, via l'EntityManager, avec un verrou.
 * - AuditService (US-AUTH-12) et MailService (US-CPT-05) sont @Global.
 */
@Module({
  imports: [
    CertificatsModule,
    TypeOrmModule.forFeature([Inscription, User, Formation, Qcm, TentativeQcm, Atelier, Livrable]),
  ],
  controllers: [InscriptionsController],
  providers: [InscriptionsService, EspaceFormationService],
  // US-ATEL-03 : la fiche d'un atelier côté apprenant réutilise le contrôle d'accès.
  exports: [EspaceFormationService],
})
export class InscriptionsModule {}

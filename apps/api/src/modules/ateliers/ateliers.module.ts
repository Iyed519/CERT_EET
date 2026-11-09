import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { CertificatsModule } from '../certificats/certificats.module';
import { FormationsModule } from '../formations/formations.module';
import { InscriptionsModule } from '../inscriptions/inscriptions.module';
import { AteliersApprenantController } from './ateliers-apprenant.controller';
import { AteliersApprenantService } from './ateliers-apprenant.service';
import { AteliersController } from './ateliers.controller';
import { AteliersService } from './ateliers.service';
import { GrillesController } from './grille/grilles.controller';
import { GrillesService } from './grille/grilles.service';
import { CorrectionsController } from './livrables/corrections.controller';
import { CorrectionsService } from './livrables/corrections.service';
import { LivrablesController } from './livrables/livrables.controller';
import { LivrablesService } from './livrables/livrables.service';

/**
 * Module des ateliers pratiques (F2 ; US-ATEL-01 création ; US-ATEL-02
 * grille de notation pondérée et modèles ; US-ATEL-03 publication ;
 * US-ATEL-04 soumission ; US-ATEL-06 correction ; la suite : US-ATEL-07 à 09).
 *
 * - Importe FormationsModule : le garde @FormateurDeLaFormation (US-AUTH-16)
 *   et FormationsService.chargerPourEcriture (404 / 409 formation archivée).
 * - forFeature : Atelier (écriture) ; ModuleFormation (LECTURE : module cible
 *   d'un nouvel atelier).
 * - Grille (US-ATEL-02) : GrillesService passe par le gestionnaire de
 *   transaction (DataSource) et réutilise AteliersService.verrouiller.
 * - Publication (US-ATEL-03) : AteliersService.publier ; côté apprenant,
 *   AteliersApprenantController, qui importe InscriptionsModule pour le
 *   contrôle d'accès de « Mon espace » (EspaceFormationService).
 * - Livrables (US-ATEL-04) : LivrablesController / LivrablesService, dépôt
 *   multipart vers StockageService (@Global, MinIO) ; Livrable en forFeature.
 * - Correction (US-ATEL-06) : CorrectionsController / CorrectionsService,
 *   côté formateur ; @FormateurDeLaFormation({ livrableId }) remonte du
 *   livrable à sa formation ; téléchargement en flux via StockageService.
 * - AuditService (US-AUTH-12), MailService et StockageService sont @Global.
 */
@Module({
  imports: [
    CertificatsModule,
    FormationsModule,
    InscriptionsModule,
    TypeOrmModule.forFeature([Atelier, ModuleFormation, Livrable]),
  ],
  controllers: [
    AteliersController,
    GrillesController,
    AteliersApprenantController,
    LivrablesController,
    CorrectionsController,
  ],
  providers: [
    AteliersService,
    GrillesService,
    AteliersApprenantService,
    LivrablesService,
    CorrectionsService,
  ],
})
export class AteliersModule {}

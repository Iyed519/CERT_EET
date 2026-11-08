import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { FormationsModule } from '../formations/formations.module';
import { AteliersController } from './ateliers.controller';
import { AteliersService } from './ateliers.service';
import { GrillesController } from './grille/grilles.controller';
import { GrillesService } from './grille/grilles.service';

/**
 * Module des ateliers pratiques (F2 ; US-ATEL-01 création ; US-ATEL-02
 * grille de notation pondérée et modèles ; la publication, la soumission et
 * la correction suivront : US-ATEL-03 à 09).
 *
 * - Importe FormationsModule : le garde @FormateurDeLaFormation (US-AUTH-16)
 *   et FormationsService.chargerPourEcriture (404 / 409 formation archivée).
 * - forFeature : Atelier (écriture) ; ModuleFormation (LECTURE : module cible
 *   d'un nouvel atelier).
 * - Grille (US-ATEL-02) : GrillesService passe par le gestionnaire de
 *   transaction (DataSource) et réutilise AteliersService.verrouiller.
 * - AuditService (US-AUTH-12) est @Global.
 */
@Module({
  imports: [FormationsModule, TypeOrmModule.forFeature([Atelier, ModuleFormation])],
  controllers: [AteliersController, GrillesController],
  providers: [AteliersService, GrillesService],
})
export class AteliersModule {}

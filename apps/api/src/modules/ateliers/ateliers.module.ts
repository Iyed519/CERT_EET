import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { FormationsModule } from '../formations/formations.module';
import { AteliersController } from './ateliers.controller';
import { AteliersService } from './ateliers.service';

/**
 * Module des ateliers pratiques (F2 ; US-ATEL-01 création ; la grille,
 * la publication, la soumission et la correction suivront : US-ATEL-02 à 09).
 *
 * - Importe FormationsModule : le garde @FormateurDeLaFormation (US-AUTH-16)
 *   et FormationsService.chargerPourEcriture (404 / 409 formation archivée).
 * - forFeature : Atelier (écriture) ; ModuleFormation (LECTURE : module cible
 *   d'un nouvel atelier).
 * - AuditService (US-AUTH-12) est @Global.
 */
@Module({
  imports: [FormationsModule, TypeOrmModule.forFeature([Atelier, ModuleFormation])],
  controllers: [AteliersController],
  providers: [AteliersService],
})
export class AteliersModule {}

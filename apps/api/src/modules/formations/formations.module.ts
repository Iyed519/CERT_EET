import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { AdminFormationsController } from './admin-formations.controller';
import { FormationsController } from './formations.controller';
import { FormationsService } from './formations.service';

/**
 * Module des formations (US-FORM-01).
 *
 * - forFeature([Formation]) : création et lecture des formations ; les
 *   modules sont chargés par la relation `formation.modules`.
 * - AuditService est @Global (US-AUTH-12) — pas d'import nécessaire.
 * - Deux contrôleurs : administration (AdminFormationsController, écriture)
 *   et consultation (FormationsController, lecture), séparés par préfixe de
 *   route et par protection.
 * - FormationsService est exporté : les stories suivantes (affectation d'un
 *   formateur, inscription) s'appuieront sur lui.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Formation])],
  controllers: [AdminFormationsController, FormationsController],
  providers: [FormationsService],
  exports: [FormationsService],
})
export class FormationsModule {}

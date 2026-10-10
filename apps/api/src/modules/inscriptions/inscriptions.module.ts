import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inscription } from '../../database/entities/inscription.entity';
import { User } from '../../database/entities/user.entity';
import { InscriptionsController } from './inscriptions.controller';
import { InscriptionsService } from './inscriptions.service';

/**
 * Module des inscriptions (US-INSC-01 ; US-INSC-04 et la désinscription
 * suivront).
 *
 * - forFeature : Inscription (écriture) et User (LECTURE seule : email et
 *   prénom pour l'email de bienvenue). La formation est lue DANS la
 *   transaction d'inscription, via l'EntityManager, avec un verrou : pas
 *   besoin de son repository ici.
 * - AuditService (US-AUTH-12) et MailService (US-CPT-05) sont @Global.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Inscription, User])],
  controllers: [InscriptionsController],
  providers: [InscriptionsService],
})
export class InscriptionsModule {}

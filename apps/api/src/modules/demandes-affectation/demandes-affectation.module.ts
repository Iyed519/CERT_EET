import { Module } from '@nestjs/common';
import {
  DemandesAffectationAdminController,
  DemandesAffectationFormateurController,
} from './demandes-affectation.controller';
import { DemandesAffectationService } from './demandes-affectation.service';

/**
 * US-FORM-07 — Demandes d'affectation d'un formateur à une formation
 * existante. AuditService et MailService sont globaux.
 */
@Module({
  controllers: [DemandesAffectationFormateurController, DemandesAffectationAdminController],
  providers: [DemandesAffectationService],
})
export class DemandesAffectationModule {}

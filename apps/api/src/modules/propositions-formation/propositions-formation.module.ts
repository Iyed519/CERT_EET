import { Module } from '@nestjs/common';
import {
  PropositionsAdminController,
  PropositionsFormateurController,
} from './propositions-formation.controller';
import { PropositionsFormationService } from './propositions-formation.service';

/** US-FORM-08 — Propositions de nouvelles formations par les formateurs. */
@Module({
  controllers: [PropositionsFormateurController, PropositionsAdminController],
  providers: [PropositionsFormationService],
})
export class PropositionsFormationModule {}

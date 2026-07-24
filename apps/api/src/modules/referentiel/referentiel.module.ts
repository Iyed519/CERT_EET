import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import { Etablissement } from '../../database/entities/etablissement.entity';
import { ReferentielController } from './referentiel.controller';
import { ReferentielService } from './referentiel.service';
/**
 * Module référentiel (US-AUTH-15) : domaines + établissements en lecture seule
 * pour la carte de complétion du profil apprenant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DomaineEtudes, Etablissement])],
  controllers: [ReferentielController],
  providers: [ReferentielService],
})
export class ReferentielModule {}

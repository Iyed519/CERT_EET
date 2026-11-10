import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TentativeQcm } from '../../../database/entities/tentative-qcm.entity';
import { FormationsModule } from '../../formations/formations.module';
import { TentativeCorrectionService } from '../tentative-correction.service';
import { TentativeTirageService } from '../tentative-tirage.service';
import {
  HistoriqueApprenantController,
  HistoriqueFormateurController,
} from './historique-tentatives.controller';
import { HistoriqueTentativesService } from './historique-tentatives.service';

/**
 * US-QCM-11 — Historique des tentatives. Module à part : il a besoin de la
 * garde de formation (FormationsModule), que TentativesModule n'importe pas
 * (aucune dépendance vers le côté formateur). Les deux services de lecture
 * réutilisés sont sans état.
 */
@Module({
  imports: [FormationsModule, TypeOrmModule.forFeature([TentativeQcm])],
  controllers: [HistoriqueApprenantController, HistoriqueFormateurController],
  providers: [HistoriqueTentativesService, TentativeCorrectionService, TentativeTirageService],
})
export class HistoriqueTentativesModule {}

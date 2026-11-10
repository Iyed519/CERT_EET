import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatutAlerte } from '../../database/enums/statut-alerte.enum';

/** US-SUIVI-02 — Filtre de la liste des alertes (statut, formation). */
export class FiltreAlertesDto {
  @ApiPropertyOptional({ enum: StatutAlerte, description: 'OUVERTE ou TRAITEE (toutes sinon).' })
  @IsOptional()
  @IsEnum(StatutAlerte, { message: 'Statut inconnu : OUVERTE ou TRAITEE.' })
  statut?: StatutAlerte;

  @ApiPropertyOptional({ description: 'Une seule formation (identifiant).' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de formation mal formé.' })
  formationId?: string;
}

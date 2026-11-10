import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { StatutFormation } from '../../../database/enums/statut-formation.enum';

/**
 * US-FORM-02 — Changer le statut d'une formation : FERMEE (clôturer),
 * ARCHIVEE (archiver) ou OUVERTE (rouvrir une formation fermée).
 * `confirmer: true` est exigé quand des évaluations sont en cours.
 */
export class ChangerStatutFormationDto {
  @ApiProperty({ enum: StatutFormation, example: StatutFormation.FERMEE })
  @IsEnum(StatutFormation, { message: 'statut invalide : OUVERTE, FERMEE ou ARCHIVEE.' })
  statut: StatutFormation;

  @ApiPropertyOptional({
    description: 'Confirmation explicite quand des évaluations sont en cours.',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'confirmer doit être un booléen.' })
  confirmer?: boolean;
}

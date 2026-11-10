import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { BORNES_TRACABILITE } from './tracabilite.regles';

/** Filtres de GET /admin/generations-ia (US-IA-05). */
export class FiltreGenerationsDto {
  @ApiPropertyOptional({ description: 'Formateur qui a lancé la génération.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'formateurId doit être un UUID.' })
  formateurId?: string;

  @ApiPropertyOptional({ description: 'Formation du module ciblé.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'formationId doit être un UUID.' })
  formationId?: string;

  @ApiPropertyOptional({ enum: ['EN_COURS', 'TERMINEE', 'ECHEC'] })
  @IsOptional()
  @IsIn(['EN_COURS', 'TERMINEE', 'ECHEC'], {
    message: 'statut doit être EN_COURS, TERMINEE ou ECHEC.',
  })
  statut?: string;

  @ApiPropertyOptional({ description: 'Lancées à partir de (ISO 8601).' })
  @IsOptional()
  @IsDateString({}, { message: 'du doit être une date ISO 8601.' })
  du?: string;

  @ApiPropertyOptional({ description: 'Lancées jusqu’à (ISO 8601).' })
  @IsOptional()
  @IsDateString({}, { message: 'au doit être une date ISO 8601.' })
  au?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier.' })
  @Min(1, { message: 'page doit être au moins 1.' })
  page?: number;

  @ApiPropertyOptional({
    default: BORNES_TRACABILITE.limiteDefaut,
    maximum: BORNES_TRACABILITE.limiteMax,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite doit être un entier.' })
  @Min(1, { message: 'limite doit être au moins 1.' })
  @Max(BORNES_TRACABILITE.limiteMax, {
    message: `limite ne peut pas dépasser ${BORNES_TRACABILITE.limiteMax}.`,
  })
  limite?: number;
}

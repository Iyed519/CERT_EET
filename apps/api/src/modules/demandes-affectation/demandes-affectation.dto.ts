import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { STATUTS_DEMANDE_AFFECTATION, StatutDemandeAffectation } from './demandes-affectation.regles';

/** US-FORM-07 — Corps de POST /formateur/demandes-affectation. */
export class CreerDemandeAffectationDto {
  @ApiProperty({ description: 'Formation existante, non archivée, où je ne suis pas affecté.' })
  @IsUUID('4', { message: 'Formation invalide.' })
  formationId: string;

  @ApiProperty({ minLength: 10, maxLength: 1000, example: 'J’enseigne NestJS depuis trois ans et je peux reprendre le module API.' })
  @IsString({ message: 'Le motif est requis.' })
  motif: string;
}

/** US-FORM-07 — Corps de PATCH /admin/demandes-affectation/:id/refuser. */
export class RefuserDemandeAffectationDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString({ message: 'Le motif du refus est requis.' })
  motif: string;
}

/** US-FORM-07 — Filtres de la liste administrateur. */
export class ListerDemandesAffectationDto {
  @ApiPropertyOptional({ enum: STATUTS_DEMANDE_AFFECTATION })
  @IsOptional()
  @IsIn(STATUTS_DEMANDE_AFFECTATION, { message: 'Statut invalide.' })
  statut?: StatutDemandeAffectation;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

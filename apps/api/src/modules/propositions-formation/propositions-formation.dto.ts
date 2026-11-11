import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STATUTS_PROPOSITION, StatutProposition } from './propositions-formation.regles';

const rogner = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * US-FORM-08 — Proposition d'une formation : mêmes bornes que la création par
 * l'administrateur (US-FORM-01) pour les champs communs ; public visé et motif
 * en plus. Corps de POST (création) et de PUT (modification + resoumission).
 */
export class PropositionFormationDto {
  @ApiProperty({ example: 'Kubernetes en production', maxLength: 255 })
  @Transform(rogner)
  @IsString({ message: 'Le titre doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @MaxLength(255, { message: 'Le titre ne peut excéder 255 caractères.' })
  titre: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(5000, { message: 'La description ne peut excéder 5000 caractères.' })
  description?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString({ message: 'Les objectifs doivent être un texte.' })
  @MaxLength(5000, { message: 'Les objectifs ne peuvent excéder 5000 caractères.' })
  objectifs?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000 })
  @IsOptional()
  @IsInt({ message: 'La durée doit être un nombre entier d’heures.' })
  @Min(1, { message: 'La durée doit être supérieure à 0.' })
  @Max(10000, { message: 'La durée ne peut excéder 10000 heures.' })
  dureeHeures?: number;

  @ApiProperty({ minimum: 1, maximum: 100000 })
  @IsInt({ message: 'La capacité doit être un nombre entier.' })
  @Min(1, { message: 'La capacité doit être supérieure à 0.' })
  @Max(100000, { message: 'La capacité ne peut excéder 100000.' })
  capaciteMax: number;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Développeurs back-end, administrateurs système.' })
  @IsOptional()
  @IsString({ message: 'Le public visé doit être un texte.' })
  @MaxLength(1000, { message: 'Le public visé ne peut excéder 1000 caractères.' })
  publicVise?: string;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString({ message: 'Le motif est requis.' })
  motif: string;
}

/** Commentaire (demande de modifications) ou motif (refus) de l'administrateur. */
export class CommentairePropositionDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString({ message: 'Le commentaire est requis.' })
  commentaire: string;
}

export class ListerPropositionsDto {
  @ApiPropertyOptional({ enum: STATUTS_PROPOSITION })
  @IsOptional()
  @IsIn(STATUTS_PROPOSITION, { message: 'Statut invalide.' })
  statut?: StatutProposition;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

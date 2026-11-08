import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BORNES_GRILLE } from '../grille.regles';

const B = BORNES_GRILLE;

/**
 * Un niveau de performance saisi (US-ATEL-02). Le libellé n'est PAS fourni :
 * il découle du rang dans la liste (1 Insuffisant, 2 Acceptable, 3 Bon,
 * 4 Excellent). Plage en % des points du critère.
 */
export class NiveauDto {
  @ApiProperty({ example: 0, minimum: 0, maximum: 100 })
  @IsInt({ message: 'Le minimum d’une plage doit être un entier.' })
  @Min(0, { message: 'Une plage commence au moins à 0 %.' })
  @Max(100, { message: 'Une plage ne dépasse pas 100 %.' })
  pointsMinPct: number;

  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @IsInt({ message: 'Le maximum d’une plage doit être un entier.' })
  @Min(0, { message: 'Une plage commence au moins à 0 %.' })
  @Max(100, { message: 'Une plage ne dépasse pas 100 %.' })
  pointsMaxPct: number;

  @ApiPropertyOptional({ example: 'L’API ne démarre pas ou la plupart des routes échouent.' })
  @IsOptional()
  @IsString({ message: 'Le descripteur doit être un texte.' })
  @MaxLength(B.descripteurMax, {
    message: 'Un descripteur ne peut pas dépasser 1 000 caractères.',
  })
  descripteur?: string | null;
}

/**
 * Corps de POST /ateliers/:atelierId/grille/criteres (US-ATEL-02, DS-13
 * partie 2). `niveaux` facultatif : sans lui, les plages par défaut
 * 0–25 / 25–50 / 50–75 / 75–100 %.
 */
export class CreateCritereDto {
  @ApiProperty({ example: 'Fonctionnement', minLength: 3, maxLength: 200 })
  @IsString({ message: 'L’intitulé doit être un texte.' })
  @IsNotEmpty({ message: 'L’intitulé est obligatoire.' })
  @MinLength(B.intitule.min, { message: 'L’intitulé doit contenir au moins 3 caractères.' })
  @MaxLength(B.intitule.max, { message: 'L’intitulé ne peut pas dépasser 200 caractères.' })
  intitule: string;

  @ApiProperty({ example: 40, minimum: 1, maximum: 100, description: 'Pondération en %.' })
  @IsInt({ message: 'La pondération doit être un nombre entier de pourcents.' })
  @Min(B.ponderation.min, { message: 'La pondération est d’au moins 1 %.' })
  @Max(B.ponderation.max, { message: 'La pondération ne dépasse pas 100 %.' })
  ponderation: number;

  @ApiPropertyOptional({ example: 'Les routes répondent comme spécifié.', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(B.descriptionMax, {
    message: 'La description ne peut pas dépasser 2 000 caractères.',
  })
  description?: string;

  @ApiPropertyOptional({
    type: [NiveauDto],
    description:
      'Exactement 4 niveaux (Insuffisant, Acceptable, Bon, Excellent), plages contiguës de 0 à 100 %.',
  })
  @IsOptional()
  @IsArray({ message: 'niveaux doit être une liste.' })
  @ArrayMinSize(4, { message: 'Un critère compte exactement 4 niveaux.' })
  @ArrayMaxSize(4, { message: 'Un critère compte exactement 4 niveaux.' })
  @ValidateNested({ each: true })
  @Type(() => NiveauDto)
  niveaux?: NiveauDto[];
}

/**
 * Corps de PATCH /ateliers/:atelierId/grille/criteres/:critereId : tous les
 * champs facultatifs ; `description: null` l'efface ; `niveaux` remplace
 * les 4 niveaux d'un bloc.
 */
export class UpdateCritereDto {
  @ApiPropertyOptional({ example: 'Fonctionnement', minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'L’intitulé doit être un texte.' })
  @MinLength(B.intitule.min, { message: 'L’intitulé doit contenir au moins 3 caractères.' })
  @MaxLength(B.intitule.max, { message: 'L’intitulé ne peut pas dépasser 200 caractères.' })
  intitule?: string;

  @ApiPropertyOptional({ example: 35, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt({ message: 'La pondération doit être un nombre entier de pourcents.' })
  @Min(B.ponderation.min, { message: 'La pondération est d’au moins 1 %.' })
  @Max(B.ponderation.max, { message: 'La pondération ne dépasse pas 100 %.' })
  ponderation?: number;

  @ApiPropertyOptional({ example: null, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(B.descriptionMax, {
    message: 'La description ne peut pas dépasser 2 000 caractères.',
  })
  description?: string | null;

  @ApiPropertyOptional({ type: [NiveauDto] })
  @IsOptional()
  @IsArray({ message: 'niveaux doit être une liste.' })
  @ArrayMinSize(4, { message: 'Un critère compte exactement 4 niveaux.' })
  @ArrayMaxSize(4, { message: 'Un critère compte exactement 4 niveaux.' })
  @ValidateNested({ each: true })
  @Type(() => NiveauDto)
  niveaux?: NiveauDto[];
}

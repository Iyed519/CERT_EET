import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BORNES_GENERATION,
  NIVEAUX_GENERATION,
  NiveauGeneration,
  TYPES_GENERABLES,
  TypeGenerable,
} from './generation.regles';

/** Paramètres d'une génération (US-IA-02, DS-06 partie 2). */
export class LancerGenerationDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Support INDEXE du module, source unique du contexte.',
  })
  @IsUUID('4', { message: 'Le support doit être un identifiant valide.' })
  supportId: string;

  @ApiProperty({ minimum: 1, maximum: 20, example: 10 })
  @IsInt({ message: 'Le nombre de questions doit être un entier.' })
  @Min(BORNES_GENERATION.nbMin, { message: 'Demandez au moins 1 question.' })
  @Max(BORNES_GENERATION.nbMax, { message: 'Demandez 20 questions au plus par génération.' })
  nbQuestions: number;

  @ApiProperty({ enum: TYPES_GENERABLES, isArray: true, example: ['QCU', 'QCM'] })
  @IsArray({ message: 'Les types doivent être une liste.' })
  @ArrayNotEmpty({ message: 'Choisissez au moins un type de question.' })
  @ArrayMaxSize(TYPES_GENERABLES.length, { message: 'Trois types au plus.' })
  @ArrayUnique({ message: 'Chaque type ne figure qu’une fois.' })
  @IsIn(TYPES_GENERABLES as unknown as string[], {
    each: true,
    message: 'Types possibles : QCU, QCM, VRAI_FAUX.',
  })
  types: TypeGenerable[];

  @ApiProperty({ enum: NIVEAUX_GENERATION, example: 'INTERMEDIAIRE' })
  @IsIn(NIVEAUX_GENERATION as unknown as string[], {
    message: 'Niveaux possibles : DEBUTANT, INTERMEDIAIRE, AVANCE.',
  })
  niveau: NiveauGeneration;

  @ApiPropertyOptional({ maxLength: 200, example: 'sécurité JWT' })
  @IsOptional()
  @IsString({ message: 'Le thème doit être un texte.' })
  @MaxLength(BORNES_GENERATION.focusMax, { message: 'Le thème fait 200 caractères au plus.' })
  focusThematique?: string;
}

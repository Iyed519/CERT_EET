import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TypeQuestion } from '../../../database/enums/type-question.enum';

/** Niveaux de difficulté proposés au formateur (UC1 Formateur). */
export const NIVEAUX_DIFFICULTE = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'] as const;

/** Une option de réponse, telle que la saisit le formateur. */
export class OptionDto {
  @ApiProperty({ example: 'Intégration continue' })
  @IsString({ message: 'Le texte d’une option doit être un texte.' })
  @IsNotEmpty({ message: 'Le texte d’une option ne peut pas être vide.' })
  @MaxLength(1000, { message: 'Une option ne peut pas dépasser 1000 caractères.' })
  texte: string;

  @ApiProperty({ example: true })
  @IsBoolean({ message: 'estCorrecte doit valoir true ou false.' })
  estCorrecte: boolean;
}

/**
 * Corps de création ET de remplacement d'une question (US-QCM-01).
 *
 * Le DTO ne vérifie que la FORME. Les règles métier (nombre d'options, bonnes
 * réponses selon le type, doublons) sont appliquées par le service, avec un
 * message ciblé par règle (critère d'erreur de la story).
 */
export class QuestionDto {
  @ApiProperty({ example: 'Que désigne le sigle CI ?' })
  @IsString({ message: 'L’énoncé doit être un texte.' })
  @IsNotEmpty({ message: 'L’énoncé est obligatoire.' })
  @MaxLength(4000, { message: 'L’énoncé ne peut pas dépasser 4000 caractères.' })
  enonce: string;

  @ApiProperty({ enum: TypeQuestion, example: TypeQuestion.QCU })
  @IsEnum(TypeQuestion, { message: 'Type de question inconnu.' })
  type: TypeQuestion;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Poids dans le score (> 0).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La pondération doit être un nombre.' })
  @Min(0.01, { message: 'La pondération doit être strictement positive.' })
  @Max(100, { message: 'La pondération ne peut pas dépasser 100.' })
  ponderation?: number;

  @ApiPropertyOptional({ example: 'CI = Continuous Integration.' })
  @IsOptional()
  @IsString({ message: 'L’explication doit être un texte.' })
  @MaxLength(4000, { message: 'L’explication ne peut pas dépasser 4000 caractères.' })
  explication?: string;

  @ApiPropertyOptional({ enum: NIVEAUX_DIFFICULTE })
  @IsOptional()
  @IsIn(NIVEAUX_DIFFICULTE as unknown as string[], {
    message: 'Niveau de difficulté attendu : DEBUTANT, INTERMEDIAIRE ou AVANCE.',
  })
  niveauDifficulte?: (typeof NIVEAUX_DIFFICULTE)[number];

  @ApiProperty({ type: [OptionDto] })
  @IsArray({ message: 'options doit être une liste.' })
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}

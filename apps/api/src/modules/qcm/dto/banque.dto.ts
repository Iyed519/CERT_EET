import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BORNES_BANQUE, MESSAGE_IMPORT_VIDE } from '../banque.regles';

/** Requête de GET /qcm/:qcmId/banque (US-QCM-02). */
export class RechercheBanqueDto {
  @ApiPropertyOptional({ description: 'Texte cherché dans l’énoncé (insensible à la casse).' })
  @IsOptional()
  @IsString({ message: 'recherche doit être un texte.' })
  @MaxLength(BORNES_BANQUE.rechercheMax, {
    message: `recherche ne doit pas dépasser ${BORNES_BANQUE.rechercheMax} caractères.`,
  })
  recherche?: string;
}

/** Corps de POST /qcm/:qcmId/banque/import (US-QCM-02) : questions à LIER. */
export class ImportBanqueDto {
  @ApiProperty({ type: [String], description: 'Questions de la banque, dans l’ordre voulu.' })
  @IsArray({ message: 'questionIds doit être une liste.' })
  @ArrayNotEmpty({ message: MESSAGE_IMPORT_VIDE })
  @ArrayMaxSize(BORNES_BANQUE.importMax, {
    message: `Au plus ${BORNES_BANQUE.importMax} questions par import.`,
  })
  @IsUUID(undefined, { each: true, message: 'Chaque identifiant de question doit être un UUID.' })
  questionIds: string[];
}

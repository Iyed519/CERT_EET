import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BORNES_GRILLE } from '../grille.regles';

/**
 * Corps de PUT /ateliers/:atelierId/grille/criteres/ordre : la liste
 * COMPLÈTE des critères, dans l'ordre voulu (même principe que les questions
 * d'un QCM).
 */
export class OrdreCriteresDto {
  @ApiProperty({ type: [String] })
  @IsArray({ message: 'critereIds doit être une liste.' })
  @ArrayNotEmpty({ message: 'critereIds ne peut pas être vide.' })
  @ArrayUnique({ message: 'critereIds ne doit pas contenir de doublon.' })
  @IsUUID(undefined, { each: true, message: 'Chaque identifiant de critère doit être un UUID.' })
  critereIds: string[];
}

/** Corps de POST /ateliers/:atelierId/grille/modele : le nom du modèle. */
export class EnregistrerModeleDto {
  @ApiProperty({ example: 'Projet API — 4 critères', minLength: 3, maxLength: 120 })
  @IsString({ message: 'Le nom du modèle doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom du modèle est obligatoire.' })
  @MinLength(BORNES_GRILLE.nomModele.min, {
    message: 'Le nom du modèle doit contenir au moins 3 caractères.',
  })
  @MaxLength(BORNES_GRILLE.nomModele.max, {
    message: 'Le nom du modèle ne peut pas dépasser 120 caractères.',
  })
  nomModele: string;
}

/** Corps de POST /ateliers/:atelierId/grille/copier : le modèle à copier. */
export class CopierModeleDto {
  @ApiProperty({ example: '0b6f3c1e-2d4a-4c7b-9f10-3a5e8d7c6b21' })
  @IsUUID(undefined, { message: 'modeleId doit être un UUID.' })
  modeleId: string;
}

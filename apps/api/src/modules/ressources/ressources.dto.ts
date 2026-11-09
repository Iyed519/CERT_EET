import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BORNES_RESSOURCE } from './ressource.regles';

/** Ajouter un lien à un module (US-FORM-05). */
export class AjouterLienDto {
  @ApiProperty({ maxLength: 200, example: 'Vidéo : les jetons JWT en 10 minutes' })
  @IsString({ message: 'Le titre doit être un texte.' })
  @MinLength(1, { message: 'Le titre est obligatoire.' })
  @MaxLength(BORNES_RESSOURCE.titreMax, { message: 'Le titre fait 200 caractères au plus.' })
  titre: string;

  @ApiProperty({ maxLength: 2048, example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  @IsString({ message: 'L’adresse doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.urlMax, { message: 'L’adresse fait 2 048 caractères au plus.' })
  url: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.descriptionMax, {
    message: 'La description fait 500 caractères au plus.',
  })
  description?: string;
}

/** Modifier une ressource : au moins un champ. */
export class ModifierRessourceDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'Le titre doit être un texte.' })
  @MinLength(1, { message: 'Le titre ne peut pas être vide.' })
  @MaxLength(BORNES_RESSOURCE.titreMax, { message: 'Le titre fait 200 caractères au plus.' })
  titre?: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString({ message: 'L’adresse doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.urlMax, { message: 'L’adresse fait 2 048 caractères au plus.' })
  url?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    description: 'Chaîne vide : retire la description.',
  })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.descriptionMax, {
    message: 'La description fait 500 caractères au plus.',
  })
  description?: string;
}

/** Nouvel ordre : toutes les ressources du module, chacune une fois. */
export class ReordonnerRessourcesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray({ message: 'L’ordre doit être une liste.' })
  @ArrayNotEmpty({ message: 'L’ordre ne peut pas être vide.' })
  @ArrayMaxSize(BORNES_RESSOURCE.parModuleMax, { message: '50 ressources au plus.' })
  @IsUUID('4', { each: true, message: 'Chaque ressource doit être un identifiant valide.' })
  ids: string[];
}

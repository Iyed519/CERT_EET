import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Format imposé aux dates de calendrier : AAAA-MM-JJ, sans heure. */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DTO de création d'une formation (US-FORM-01, DS-16 P1).
 *
 * Corps de POST /admin/formations. Le ValidationPipe global (whitelist +
 * forbidNonWhitelisted, main.ts) applique ces règles AVANT le contrôleur et
 * rejette en 400 tout champ non déclaré ici. C'est voulu pour `statut` : une
 * formation naît toujours OUVERTE, c'est le serveur qui le décide — un client
 * qui enverrait `statut` reçoit une erreur plutôt qu'un silence.
 *
 * Les deux règles du Gherkin (capacité > 0, seuil dans [0,100]) sont validées
 * ici pour produire un 400 lisible ; les contraintes CHECK de la base en sont
 * le filet de sécurité.
 */
export class CreateFormationDto {
  @ApiProperty({ example: 'Développeur Full-Stack JavaScript', maxLength: 255 })
  // Je retire les espaces de bord : un titre « "   " » doit être refusé.
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Le titre doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @MaxLength(255, { message: 'Le titre ne peut excéder 255 caractères.' })
  titre: string;

  @ApiPropertyOptional({ example: 'Parcours certifiant de 120 heures.', maxLength: 5000 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(5000, { message: 'La description ne peut excéder 5000 caractères.' })
  description?: string;

  @ApiPropertyOptional({
    example: 'Concevoir et sécuriser une API REST ; déployer avec Docker.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString({ message: 'Les objectifs doivent être un texte.' })
  @MaxLength(5000, { message: 'Les objectifs ne peuvent excéder 5000 caractères.' })
  objectifs?: string;

  @ApiPropertyOptional({ example: 'Bases de JavaScript et de SQL.', maxLength: 5000 })
  @IsOptional()
  @IsString({ message: 'Les prérequis doivent être un texte.' })
  @MaxLength(5000, { message: 'Les prérequis ne peuvent excéder 5000 caractères.' })
  prerequis?: string;

  @ApiPropertyOptional({ example: '2026-11-02', description: 'Date de début (AAAA-MM-JJ).' })
  @IsOptional()
  @Matches(FORMAT_DATE, { message: 'dateDebut doit être au format AAAA-MM-JJ.' })
  @IsISO8601({ strict: true }, { message: "dateDebut n'est pas une date valide." })
  dateDebut?: string;

  @ApiPropertyOptional({
    example: '2026-12-18',
    description: 'Date de fin (AAAA-MM-JJ), postérieure ou égale à la date de début.',
  })
  @IsOptional()
  @Matches(FORMAT_DATE, { message: 'dateFin doit être au format AAAA-MM-JJ.' })
  @IsISO8601({ strict: true }, { message: "dateFin n'est pas une date valide." })
  dateFin?: string;

  @ApiPropertyOptional({ example: 120, minimum: 1, maximum: 10000 })
  @IsOptional()
  @IsInt({ message: 'La durée doit être un nombre entier d’heures.' })
  @Min(1, { message: 'La durée doit être supérieure à 0.' })
  @Max(10000, { message: 'La durée ne peut excéder 10000 heures.' })
  dureeHeures?: number;

  @ApiProperty({
    example: 25,
    minimum: 1,
    maximum: 100000,
    description: 'Nombre maximal d’apprenants inscrits.',
  })
  @IsInt({ message: 'La capacité doit être un nombre entier.' })
  @Min(1, { message: 'La capacité doit être supérieure à 0.' })
  @Max(100000, { message: 'La capacité ne peut excéder 100000.' })
  capaciteMax: number;

  @ApiProperty({
    example: 60,
    minimum: 0,
    maximum: 100,
    description: 'Seuil de certification, en pourcentage.',
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Le seuil de certification doit être un nombre (2 décimales au plus).' },
  )
  @Min(0, { message: 'Le seuil de certification doit être compris entre 0 et 100.' })
  @Max(100, { message: 'Le seuil de certification doit être compris entre 0 et 100.' })
  noteMinCertification: number;

  @ApiPropertyOptional({
    example: 'modele-esprit-standard',
    maxLength: 255,
    description: 'Référence du gabarit de certificat utilisé à l’émission.',
  })
  @IsOptional()
  @IsString({ message: 'Le modèle de certificat doit être un texte.' })
  @MaxLength(255, { message: 'Le modèle de certificat ne peut excéder 255 caractères.' })
  modeleCertificat?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BORNES_ATELIER, EXTENSIONS_LIVRABLE } from '../atelier.regles';

const B = BORNES_ATELIER;

/**
 * Corps de POST /modules/:moduleId/ateliers (US-ATEL-01, DS-13 partie 1).
 *
 * Le module vient de l'URL et la formation s'en déduit : le client ne
 * fournit ni `moduleId` ni `formationId` (écart assumé avec DS-13, qui les
 * plaçait dans le corps — une formation fournie par le client pourrait
 * contredire celle du module). Le statut est imposé (BROUILLON).
 */
export class CreateAtelierDto {
  @ApiProperty({ example: 'Atelier 4 — API REST sécurisée', minLength: 3, maxLength: 200 })
  @IsString({ message: 'Le titre doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @MinLength(B.titre.min, { message: 'Le titre doit contenir au moins 3 caractères.' })
  @MaxLength(B.titre.max, { message: 'Le titre ne peut pas dépasser 200 caractères.' })
  titre: string;

  @ApiProperty({
    example: 'Implémentez une API REST NestJS protégée par JWT et RBAC, avec ses tests.',
    minLength: 10,
    maxLength: 20000,
  })
  @IsString({ message: 'L’énoncé doit être un texte.' })
  @IsNotEmpty({ message: 'L’énoncé est obligatoire.' })
  @MinLength(B.enonce.min, { message: 'L’énoncé doit contenir au moins 10 caractères.' })
  @MaxLength(B.enonce.max, { message: 'L’énoncé ne peut pas dépasser 20 000 caractères.' })
  enonce: string;

  @ApiPropertyOptional({ example: 'Sécurité des API, tests automatisés', maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Les compétences visées doivent être un texte.' })
  @MaxLength(B.competencesMax, {
    message: 'Les compétences visées ne peuvent pas dépasser 2 000 caractères.',
  })
  competencesVisees?: string;

  @ApiProperty({
    example: '2026-12-15T23:59:00.000Z',
    description: 'Date limite de soumission (ISO 8601) ; doit être dans le futur.',
  })
  @IsISO8601({ strict: true }, { message: 'La date limite doit être une date ISO 8601.' })
  dateLimite: string;

  @ApiProperty({
    example: ['pdf', 'zip'],
    enum: EXTENSIONS_LIVRABLE,
    isArray: true,
    description: 'Extensions de fichier acceptées (au moins une).',
  })
  @IsArray({ message: 'Les types de livrables doivent être une liste.' })
  @ArrayNotEmpty({ message: 'Choisissez au moins un type de livrable.' })
  @ArrayMaxSize(EXTENSIONS_LIVRABLE.length, {
    message: 'Trop de types de livrables.',
  })
  @IsIn(EXTENSIONS_LIVRABLE as unknown as string[], {
    each: true,
    message: `Type de livrable non pris en charge. Types acceptés : ${EXTENSIONS_LIVRABLE.join(', ')}.`,
  })
  typesLivrables: string[];

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsInt({ message: 'La taille maximale doit être un nombre entier de Mo.' })
  @Min(B.tailleMaxMo.min, { message: 'La taille maximale doit être d’au moins 1 Mo.' })
  @Max(B.tailleMaxMo.max, { message: 'La taille maximale ne peut pas dépasser 100 Mo.' })
  tailleMaxMo?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 10, default: 1 })
  @IsOptional()
  @IsInt({ message: 'Le nombre maximal de fichiers doit être un entier.' })
  @Min(B.nbMaxFichiers.min, { message: 'Au moins 1 fichier doit être autorisé.' })
  @Max(B.nbMaxFichiers.max, { message: 'Au plus 10 fichiers par soumission.' })
  nbMaxFichiers?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 168, default: 0 })
  @IsOptional()
  @IsInt({ message: 'La tolérance de retard doit être un nombre entier d’heures.' })
  @Min(B.toleranceRetardHeures.min, {
    message: 'La tolérance de retard ne peut pas être négative.',
  })
  @Max(B.toleranceRetardHeures.max, {
    message: 'La tolérance de retard ne peut pas dépasser 168 heures (7 jours).',
  })
  toleranceRetardHeures?: number;
}

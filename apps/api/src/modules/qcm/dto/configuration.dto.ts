import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { AffichageResultats } from '../../../database/enums/affichage-resultats.enum';

/** Bornes de saisie des paramètres anti-fraude (US-QCM-03). */
export const BORNES_CONFIGURATION = {
  dureeMaxMinutes: { min: 1, max: 600 },
  nbTentativesMax: { min: 1, max: 20 },
  delaiEntreTentatives: { min: 0, max: 720 },
} as const;

/**
 * Corps de PUT /qcm/:qcmId/configuration (US-QCM-03, DS-12 partie 3, UC2
 * Formateur). La configuration est remplacée en entier à chaque
 * enregistrement : tous les champs sont obligatoires, sauf le tirage partiel
 * (`nbQuestionsTirees`, absent ou null = toutes les questions).
 *
 * Le DTO vérifie chaque champ isolément ; les règles qui croisent plusieurs
 * champs (fenêtre, durée, tirage ≤ nombre de questions) sont dans le service.
 */
export class ConfigurationDto {
  // --- Randomisation (appliquée par US-QCM-06) ---
  @ApiProperty({ example: true, description: 'Mélanger l’ordre des questions.' })
  @IsBoolean({ message: 'randomiserQuestions doit valoir true ou false.' })
  randomiserQuestions: boolean;

  @ApiProperty({ example: true, description: 'Mélanger l’ordre des options.' })
  @IsBoolean({ message: 'randomiserOptions doit valoir true ou false.' })
  randomiserOptions: boolean;

  @ApiPropertyOptional({
    example: 10,
    nullable: true,
    description: 'Tirer K questions parmi celles du QCM ; absent ou null = toutes.',
  })
  @IsOptional()
  @IsInt({ message: 'nbQuestionsTirees doit être un entier.' })
  @Min(1, { message: 'nbQuestionsTirees doit valoir au moins 1.' })
  nbQuestionsTirees?: number | null;

  // --- Temps (appliqué par US-QCM-07) ---
  @ApiProperty({
    example: 30,
    description: 'Durée maximale d’une tentative, en minutes (1 à 600).',
  })
  @IsInt({ message: 'La durée doit être un nombre entier de minutes.' })
  @Min(BORNES_CONFIGURATION.dureeMaxMinutes.min, {
    message: 'La durée doit être d’au moins 1 minute.',
  })
  @Max(BORNES_CONFIGURATION.dureeMaxMinutes.max, {
    message: 'La durée ne peut pas dépasser 600 minutes.',
  })
  dureeMaxMinutes: number;

  @ApiProperty({
    example: '2026-11-02T08:00:00.000Z',
    description: 'Ouverture (ISO 8601, avec fuseau).',
  })
  @IsDateString({ strict: true }, { message: 'dateOuverture doit être une date ISO 8601.' })
  dateOuverture: string;

  @ApiProperty({
    example: '2026-11-02T18:00:00.000Z',
    description: 'Fermeture (ISO 8601, avec fuseau).',
  })
  @IsDateString({ strict: true }, { message: 'dateFermeture doit être une date ISO 8601.' })
  dateFermeture: string;

  // --- Tentatives (appliqué par US-QCM-05 et US-QCM-10) ---
  @ApiProperty({ example: 1, description: 'Nombre maximal de tentatives par apprenant (1 à 20).' })
  @IsInt({ message: 'Le nombre de tentatives doit être un entier.' })
  @Min(BORNES_CONFIGURATION.nbTentativesMax.min, {
    message: 'Il faut autoriser au moins 1 tentative.',
  })
  @Max(BORNES_CONFIGURATION.nbTentativesMax.max, {
    message: 'Le nombre de tentatives ne peut pas dépasser 20.',
  })
  nbTentativesMax: number;

  @ApiProperty({
    example: 24,
    description: 'Délai minimal entre deux tentatives, en heures (0 à 720).',
  })
  @IsInt({ message: 'Le délai doit être un nombre entier d’heures.' })
  @Min(BORNES_CONFIGURATION.delaiEntreTentatives.min, {
    message: 'Le délai ne peut pas être négatif.',
  })
  @Max(BORNES_CONFIGURATION.delaiEntreTentatives.max, {
    message: 'Le délai ne peut pas dépasser 720 heures (30 jours).',
  })
  delaiEntreTentatives: number;

  @ApiProperty({ example: false, description: 'Enregistré ; appliqué par US-QCM-10 (Sprint 3).' })
  @IsBoolean({ message: 'blocageSessionsMultiples doit valoir true ou false.' })
  blocageSessionsMultiples: boolean;

  // --- Résultat (appliqué par US-QCM-08 et US-QCM-09) ---
  @ApiProperty({ enum: AffichageResultats, example: AffichageResultats.DIFFERE })
  @IsEnum(AffichageResultats, { message: 'affichageResultats attendu : IMMEDIAT ou DIFFERE.' })
  affichageResultats: AffichageResultats;

  @ApiProperty({
    example: 60,
    description: 'Score minimal pour réussir la tentative, en % (0 à 100).',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le seuil de réussite doit être un nombre.' })
  @Min(0, { message: 'Le seuil de réussite doit être compris entre 0 et 100.' })
  @Max(100, { message: 'Le seuil de réussite doit être compris entre 0 et 100.' })
  scoreMinValidation: number;

  @ApiProperty({
    example: 30,
    description: 'Poids du QCM dans la note de la formation, en % (0 à 100).',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La pondération doit être un nombre.' })
  @Min(0, { message: 'La pondération doit être comprise entre 0 et 100.' })
  @Max(100, { message: 'La pondération doit être comprise entre 0 et 100.' })
  ponderationFormation: number;

  // --- Enregistrés, sans effet serveur pour l'instant ---
  @ApiProperty({ example: false, description: 'Enregistré ; pas encore appliqué.' })
  @IsBoolean({ message: 'proctoringWebcam doit valoir true ou false.' })
  proctoringWebcam: boolean;

  @ApiProperty({ example: false, description: 'Enregistré ; pas encore appliqué.' })
  @IsBoolean({ message: 'desactiverCopierColler doit valoir true ou false.' })
  desactiverCopierColler: boolean;
}

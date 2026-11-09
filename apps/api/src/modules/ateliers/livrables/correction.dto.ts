import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';
import { BORNES_NOTE } from './correction.regles';

/**
 * Note d'un critère (US-ATEL-06) : niveau atteint, points DANS la plage de ce
 * niveau (en % du critère), commentaire facultatif. Les bornes sont
 * revérifiées par les règles pures (verifierPoints, nettoyerCommentaireNote)
 * et par la base (CHECK + déclencheur de cohérence).
 */
export class NoterCritereDto {
  @ApiProperty({
    description: 'Niveau atteint : 1 Insuffisant, 2 Acceptable, 3 Bon, 4 Excellent.',
    minimum: 1,
    maximum: 4,
  })
  @IsInt({ message: 'Le niveau doit être un entier de 1 à 4.' })
  @Min(1, { message: 'Le niveau doit être un entier de 1 à 4.' })
  @Max(4, { message: 'Le niveau doit être un entier de 1 à 4.' })
  niveau: number;

  @ApiProperty({
    description:
      'Points obtenus, en % des points du critère (0–100, deux décimales au plus), dans la plage du niveau choisi.',
    minimum: BORNES_NOTE.pointsMin,
    maximum: BORNES_NOTE.pointsMax,
  })
  @IsNumber(
    { maxDecimalPlaces: BORNES_NOTE.decimales, allowNaN: false, allowInfinity: false },
    { message: 'Les points sont un nombre avec deux décimales au plus.' },
  )
  @Min(BORNES_NOTE.pointsMin, { message: 'Les points sont compris entre 0 et 100 %.' })
  @Max(BORNES_NOTE.pointsMax, { message: 'Les points sont compris entre 0 et 100 %.' })
  pointsPct: number;

  @ApiPropertyOptional({
    description: 'Commentaire sur ce critère (2 000 caractères au plus) ; vide ou null l’efface.',
    maxLength: BORNES_NOTE.commentaireMax,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être un texte.' })
  @MaxLength(BORNES_NOTE.commentaireMax, {
    message: 'Le commentaire d’un critère dépasse 2 000 caractères.',
  })
  commentaire?: string | null;
}

/** Filtre de la liste des livrables d'un atelier (DS-03 : `?statut=SOUMIS`). */
export class FiltreLivrablesDto {
  @ApiPropertyOptional({ enum: StatutLivrable, description: 'Ne garder que ce statut.' })
  @IsOptional()
  @IsEnum(StatutLivrable, {
    message: 'Statut inconnu : SOUMIS, EN_CORRECTION ou NOTE.',
  })
  statut?: StatutLivrable;
}

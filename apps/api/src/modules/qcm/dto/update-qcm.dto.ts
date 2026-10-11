import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Corps de PATCH /qcm/:qcmId (US-QCM-01) : titre et description seulement.
 * `description: null` la vide (@IsOptional laisse passer null ; le service
 * refuse en revanche un titre null). Le statut évolue par ses propres routes
 * (configuration US-QCM-03, publication US-QCM-04).
 */
export class UpdateQcmDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Le titre doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide.' })
  @MaxLength(255, { message: 'Le titre ne peut pas dépasser 255 caractères.' })
  titre?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères.' })
  description?: string | null;
}

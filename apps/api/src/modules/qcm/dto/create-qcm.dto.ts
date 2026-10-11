import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Corps de POST /modules/:moduleId/qcm (US-QCM-01). Le statut est imposé (BROUILLON). */
export class CreateQcmDto {
  @ApiProperty({ example: 'Les fondamentaux de DevOps', maxLength: 255 })
  @IsString({ message: 'Le titre doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @MaxLength(255, { message: 'Le titre ne peut pas dépasser 255 caractères.' })
  titre: string;

  @ApiPropertyOptional({ example: '10 questions sur la culture DevOps et la CI.' })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères.' })
  description?: string;
}

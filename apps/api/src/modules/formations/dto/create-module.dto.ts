import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO d'ajout d'un module à une formation (US-FORM-01).
 *
 * Corps de POST /admin/formations/:formationId/modules. L'ordre n'est PAS
 * saisi : un nouveau module est toujours placé en dernier, et le
 * réordonnancement passe par une route dédiée. Je garde ainsi une numérotation
 * continue (1, 2, 3…) décidée par le serveur.
 */
export class CreateModuleDto {
  @ApiProperty({ example: 'Sécurité des API REST', maxLength: 255 })
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Le titre du module doit être un texte.' })
  @IsNotEmpty({ message: 'Le titre du module est requis.' })
  @MaxLength(255, { message: 'Le titre du module ne peut excéder 255 caractères.' })
  titre: string;

  @ApiPropertyOptional({ example: 'Authentification, JWT, OWASP Top 10.', maxLength: 5000 })
  @IsOptional()
  @IsString({ message: 'La description du module doit être un texte.' })
  @MaxLength(5000, {
    message: 'La description du module ne peut excéder 5000 caractères.',
  })
  description?: string;
}

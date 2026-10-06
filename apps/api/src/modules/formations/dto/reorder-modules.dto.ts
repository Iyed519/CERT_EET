import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * DTO de réordonnancement des modules d'une formation (US-FORM-01).
 *
 * Corps de PUT /admin/formations/:formationId/modules/ordre. Le client envoie
 * la liste COMPLÈTE des identifiants dans l'ordre voulu ; la position dans le
 * tableau devient l'ordre (1, 2, 3…). Le service vérifie que cette liste est
 * exactement celle des modules de la formation — ni oubli, ni intrus.
 */
export class ReorderModulesDto {
  @ApiProperty({
    type: [String],
    example: [
      '3f1c0f0e-9a51-4c5e-8f0a-2d0f6f3b7a11',
      '8b7a2c44-1d3e-4b9a-a6c2-5e4d3c2b1a00',
    ],
    description: 'Tous les modules de la formation, dans le nouvel ordre.',
  })
  @IsArray({ message: 'moduleIds doit être une liste.' })
  @ArrayNotEmpty({ message: 'moduleIds ne peut pas être vide.' })
  @ArrayUnique({ message: 'moduleIds ne doit pas contenir de doublon.' })
  @IsUUID(undefined, { each: true, message: 'Chaque identifiant de module doit être un UUID.' })
  moduleIds: string[];
}

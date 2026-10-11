import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Corps de PUT /qcm/:qcmId/questions/ordre (US-QCM-01) : la liste COMPLÈTE des
 * questions du QCM, dans l'ordre voulu (même principe que les modules).
 */
export class ReorderQuestionsDto {
  @ApiProperty({ type: [String] })
  @IsArray({ message: 'questionIds doit être une liste.' })
  @ArrayNotEmpty({ message: 'questionIds ne peut pas être vide.' })
  @ArrayUnique({ message: 'questionIds ne doit pas contenir de doublon.' })
  @IsUUID(undefined, { each: true, message: 'Chaque identifiant de question doit être un UUID.' })
  questionIds: string[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { QuestionDto } from '../../qcm/dto/question.dto';

/** Accepter une question extraite, telle quelle ou retouchée (US-IA-08). */
export class AccepterQuestionExtraiteDto {
  @ApiPropertyOptional({
    type: QuestionDto,
    description:
      'Version retouchée par le formateur (obligatoire si le document ne donnait pas la bonne ' +
      'réponse). Absente ou identique : ACCEPTEE, origine IA ; différente : MODIFIEE, origine ' +
      'IA_MODIFIEE.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionDto)
  question?: QuestionDto;
}

/** Rejeter une question extraite (US-IA-08). */
export class RejeterQuestionExtraiteDto {
  @ApiPropertyOptional({ maxLength: 500, example: 'Question mal recopiée.' })
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte.' })
  @MaxLength(500, { message: 'Le motif ne peut pas dépasser 500 caractères.' })
  motif?: string;
}

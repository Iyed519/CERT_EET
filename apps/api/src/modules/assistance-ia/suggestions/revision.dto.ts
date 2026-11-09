import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { QuestionDto } from '../../qcm/dto/question.dto';

/** Accepter une suggestion, telle quelle ou modifiée (US-IA-04). */
export class AccepterSuggestionDto {
  @ApiProperty({ format: 'uuid', description: 'QCM du même module qui recevra la question.' })
  @IsUUID('4', { message: 'Le QCM doit être un identifiant valide.' })
  qcmId: string;

  @ApiPropertyOptional({
    type: QuestionDto,
    description:
      'Version retouchée par le formateur. Absente (ou identique à la proposition) : ' +
      'ACCEPTEE, origine IA ; différente : MODIFIEE, origine IA_MODIFIEE.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionDto)
  question?: QuestionDto;
}

/** Rejeter une suggestion (US-IA-04). */
export class RejeterSuggestionDto {
  @ApiPropertyOptional({ maxLength: 500, example: 'Hors sujet pour ce module.' })
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte.' })
  @MaxLength(500, { message: 'Le motif ne peut pas dépasser 500 caractères.' })
  motif?: string;
}

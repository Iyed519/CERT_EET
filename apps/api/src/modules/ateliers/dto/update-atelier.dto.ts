import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BORNES_ATELIER } from '../atelier.regles';
import { CreateAtelierDto } from './create-atelier.dto';

/**
 * Corps de PATCH /ateliers/:atelierId (US-ATEL-01) : tous les champs de la
 * création, chacun facultatif. Seul un atelier en BROUILLON se modifie.
 * `competencesVisees: null` les efface ; un titre, un énoncé ou une date
 * limite null sont refusés par le service. Une nouvelle date limite doit,
 * elle aussi, être dans le futur.
 */
export class UpdateAtelierDto extends PartialType(
  OmitType(CreateAtelierDto, ['competencesVisees'] as const),
) {
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Les compétences visées doivent être un texte.' })
  @MaxLength(BORNES_ATELIER.competencesMax, {
    message: 'Les compétences visées ne peuvent pas dépasser 2 000 caractères.',
  })
  competencesVisees?: string | null;
}

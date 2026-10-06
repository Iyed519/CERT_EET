import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StatutFormation } from '../../../database/enums/statut-formation.enum';

/**
 * DTO de consultation des formations (US-FORM-01, DS-08 étape 1).
 *
 * Query string de GET /formations. Même forme que ListRoleRequestsDto :
 * filtre optionnel + pagination, `page`/`limit` convertis depuis le texte.
 * Le filtre `statut` n'est libre que pour un administrateur : les autres
 * rôles ne consultent que le catalogue (formations OUVERTE).
 */
export class ListFormationsDto {
  @ApiPropertyOptional({
    enum: StatutFormation,
    description:
      'Filtre sur le statut. Administrateur : tous les statuts par défaut. ' +
      'Autres rôles : catalogue OUVERTE uniquement.',
    example: StatutFormation.OUVERTE,
  })
  @IsOptional()
  @IsEnum(StatutFormation, {
    message: 'statut invalide : OUVERTE, FERMEE ou ARCHIVEE.',
  })
  statut?: StatutFormation;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier.' })
  @Min(1, { message: 'page doit être >= 1.' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier.' })
  @Min(1, { message: 'limit doit être >= 1.' })
  @Max(100, { message: 'limit ne peut excéder 100.' })
  limit?: number = 20;
}

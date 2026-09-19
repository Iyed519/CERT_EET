import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StatutDemande } from '../../../database/enums/statut-demande.enum';

/**
 * DTO de consultation admin des demandes de rôle (US-ROL-02, étape C).
 *
 * Query string de GET /admin/role-requests. Même forme que AuditQueryDto :
 * filtres optionnels, `page`/`limit` convertis depuis le texte via @Type. Le
 * ValidationPipe global rejette en 400 tout paramètre non déclaré ici.
 */
export class ListRoleRequestsDto {
  @ApiPropertyOptional({
    enum: StatutDemande,
    description: 'Filtre sur le statut (par défaut : tous).',
    example: StatutDemande.EN_ATTENTE,
  })
  @IsOptional()
  @IsEnum(StatutDemande, {
    message: 'statut invalide : EN_ATTENTE, APPROUVEE ou REJETEE.',
  })
  statut?: StatutDemande;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier.' })
  @Min(1, { message: 'page doit être >= 1.' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier.' })
  @Min(1, { message: 'limit doit être >= 1.' })
  @Max(200, { message: 'limit ne peut excéder 200.' })
  limit?: number = 50;
}

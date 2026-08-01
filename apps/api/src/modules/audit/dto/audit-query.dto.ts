import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * DTO de consultation du journal d'audit (US-AUTH-12, DS-16).
 *
 * Corps de la query string de GET /admin/audit-logs. Le ValidationPipe global
 * (whitelist + forbidNonWhitelisted, main.ts) rejette en 400 tout paramètre non
 * déclaré ici. Tous les filtres sont OPTIONNELS ; sans filtre, on renvoie la
 * page la plus récente. `page`/`limit` arrivent en texte (query string) : @Type
 * les convertit en nombre avant validation.
 */
export class AuditQueryDto {
  @ApiPropertyOptional({
    description: "Filtre sur le type d'action (ex. LOGIN, ROLE_CHANGE).",
    example: 'ROLE_CHANGE',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: "Filtre sur l'acteur (userId de l'auteur de l'action).",
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId doit être un UUID valide.' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Borne basse de la période (ISO 8601).',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'from doit être une date ISO 8601.' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Borne haute de la période (ISO 8601).',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'to doit être une date ISO 8601.' })
  to?: string;

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

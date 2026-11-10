import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { MESSAGE_DATE_INVALIDE } from './periode.regles';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Période d'un tableau de bord (US-DASH-01) : jours calendaires inclusifs
 * `du` et `au` (AAAA-MM-JJ, fuseau de Tunis). Facultatifs : 30 derniers jours
 * par défaut. Cohérence (`du` ≤ `au`, 366 jours au plus, date existante)
 * vérifiée par les règles de période -> 400.
 */
export class PeriodeQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Premier jour inclus.' })
  @IsOptional()
  @Matches(JOUR, { message: MESSAGE_DATE_INVALIDE })
  du?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Dernier jour inclus.' })
  @IsOptional()
  @Matches(JOUR, { message: MESSAGE_DATE_INVALIDE })
  au?: string;
}

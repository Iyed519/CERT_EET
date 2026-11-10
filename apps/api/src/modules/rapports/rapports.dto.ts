import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { FormatRapport } from '../../database/enums/rapport.enum';
import { PorteeRapport } from './rapport-session';

const PORTEES: PorteeRapport[] = ['GLOBAL', 'INDIVIDUEL', 'MODULE'];

/**
 * US-RPT-01 — Demande d'un rapport de session (DS-14 P3).
 * `apprenantId` est exigé pour la portée INDIVIDUEL, `moduleId` pour MODULE,
 * et refusé (400, champ inattendu) pour les autres portées.
 */
export class DemanderRapportSessionDto {
  @ApiProperty({ enum: FormatRapport, description: 'CSV (Excel) ou PDF.' })
  @IsEnum(FormatRapport, { message: 'Format inconnu : CSV ou PDF.' })
  format: FormatRapport;

  @ApiProperty({ enum: PORTEES, description: 'Vue globale, un apprenant, ou un module.' })
  @IsIn(PORTEES, { message: 'Portée inconnue : GLOBAL, INDIVIDUEL ou MODULE.' })
  portee: PorteeRapport;

  @ApiPropertyOptional({ description: 'Apprenant inscrit (portée INDIVIDUEL seulement).' })
  @ValidateIf(
    (o: DemanderRapportSessionDto) => o.portee === 'INDIVIDUEL' || o.apprenantId !== undefined,
  )
  @IsUUID('4', { message: 'Identifiant d’apprenant mal formé ou manquant.' })
  apprenantId?: string;

  @ApiPropertyOptional({ description: 'Module de la formation (portée MODULE seulement).' })
  @ValidateIf((o: DemanderRapportSessionDto) => o.portee === 'MODULE' || o.moduleId !== undefined)
  @IsUUID('4', { message: 'Identifiant de module mal formé ou manquant.' })
  moduleId?: string;
}

/** US-RPT-01 — Filtre facultatif de « Mes rapports ». */
export class FiltreRapportsDto {
  @ApiPropertyOptional({ description: 'Une seule formation (identifiant).' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de formation mal formé.' })
  formationId?: string;
}

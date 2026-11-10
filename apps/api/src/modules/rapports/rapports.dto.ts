import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { FormatRapport } from '../../database/enums/rapport.enum';
import { MESSAGE_DATE_INVALIDE } from '../pilotage/periode.regles';
import { MODELES, ModeleInstitutionnel } from './rapport-institutionnel';
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

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * US-RPT-02 — Demande d'un rapport institutionnel (DS-16 P4) : modèle,
 * format, période (jours inclus, AAAA-MM-JJ, heure de Tunis ; 30 derniers
 * jours par défaut, 366 au plus, début ≤ fin -> 400 sinon).
 */
export class DemanderRapportInstitutionnelDto {
  @ApiProperty({
    enum: MODELES,
    description: 'Synthèse, bilan par formation, registre des certificats.',
  })
  @IsIn(MODELES, { message: 'Modèle inconnu : SYNTHESE, FORMATIONS ou CERTIFICATS.' })
  modele: ModeleInstitutionnel;

  @ApiProperty({ enum: FormatRapport, description: 'CSV (Excel) ou PDF.' })
  @IsEnum(FormatRapport, { message: 'Format inconnu : CSV ou PDF.' })
  format: FormatRapport;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Premier jour inclus.' })
  @IsOptional()
  @Matches(JOUR, { message: MESSAGE_DATE_INVALIDE })
  du?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Dernier jour inclus.' })
  @IsOptional()
  @Matches(JOUR, { message: MESSAGE_DATE_INVALIDE })
  au?: string;
}

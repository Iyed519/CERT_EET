import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { StatutAlerte } from '../../database/enums/statut-alerte.enum';

/** US-SUIVI-02 — Filtre de la liste des alertes (statut, formation). */
export class FiltreAlertesDto {
  @ApiPropertyOptional({ enum: StatutAlerte, description: 'OUVERTE ou TRAITEE (toutes sinon).' })
  @IsOptional()
  @IsEnum(StatutAlerte, { message: 'Statut inconnu : OUVERTE ou TRAITEE.' })
  statut?: StatutAlerte;

  @ApiPropertyOptional({ description: 'Une seule formation (identifiant).' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de formation mal formé.' })
  formationId?: string;
}

const sansEspaces = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** US-SUIVI-03 — Action menée, l'alerte devient « Traitée ». */
export class TraiterAlerteDto {
  @ApiProperty({
    description: 'Action menée auprès de l’apprenant (1 à 2 000 caractères).',
    example: 'Appel téléphonique : reprise prévue lundi, point d’étape dans une semaine.',
  })
  @Transform(sansEspaces)
  @IsString({ message: 'L’action doit être un texte.' })
  @Length(1, 2000, { message: 'L’action doit compter entre 1 et 2 000 caractères.' })
  action: string;
}

/** US-SUIVI-03 — Rouvrir une alerte traitée (motif). */
export class RouvrirAlerteDto {
  @ApiProperty({
    description: 'Motif de la réouverture (1 à 2 000 caractères).',
    example: 'Pas de reprise constatée après l’appel.',
  })
  @Transform(sansEspaces)
  @IsString({ message: 'Le motif doit être un texte.' })
  @Length(1, 2000, { message: 'Le motif doit compter entre 1 et 2 000 caractères.' })
  motif: string;
}

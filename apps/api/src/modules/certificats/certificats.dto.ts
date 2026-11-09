import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';

/** Filtre de la liste des certificats (administrateur). */
export class FiltreCertificatsDto {
  @ApiPropertyOptional({ enum: StatutCertificat, description: 'Ne garder que ce statut.' })
  @IsOptional()
  @IsEnum(StatutCertificat, {
    message: 'Statut inconnu : EN_ATTENTE_GENERATION, EN_GENERATION, ACTIF ou REVOQUE.',
  })
  statut?: StatutCertificat;
}

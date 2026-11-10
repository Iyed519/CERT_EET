import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Filtre de GET /mes-tentatives (US-QCM-11). */
export class FiltreMesTentativesDto {
  @ApiPropertyOptional({ description: 'Seulement les tentatives de ce QCM.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'qcmId doit être un UUID.' })
  qcmId?: string;
}

/** Filtre de GET /formateur/qcm/:qcmId/tentatives (US-QCM-11). */
export class FiltreTentativesQcmDto {
  @ApiPropertyOptional({ description: 'Seulement les tentatives de cet apprenant.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'apprenantId doit être un UUID.' })
  apprenantId?: string;
}

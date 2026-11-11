import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * US-QCM-12 — Corps facultatif de POST /qcm/:qcmId/tentatives : consentement
 * à la surveillance webcam, exigé seulement pour un QCM surveillé.
 */
export class DemarrerTentativeDto {
  @ApiPropertyOptional({
    description: 'Consentement explicite à la surveillance webcam (QCM surveillé seulement).',
  })
  @IsOptional()
  // Valeur brute, sans conversion implicite : « "oui" » ou « 1 » ne valent
  // PAS consentement (seul le booléen true l'exprime).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean({ message: 'consentementSurveillance doit valoir true ou false.' })
  consentementSurveillance?: boolean;
}

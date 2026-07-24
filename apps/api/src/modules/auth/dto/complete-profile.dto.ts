import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NiveauEtudes } from '../../../database/enums/niveau-etudes.enum';
/**
 * DTO de complétion du profil apprenant (US-AUTH-15).
 *
 * Corps de PATCH /auth/profile. Le ValidationPipe global (whitelist:true) retire
 * tout champ non déclaré ici. La règle métier « âge >= 13 » et la cohérence
 * domaine/établissement selon `enEtudes` sont vérifiées dans AuthService.
 */
export class CompleteProfileDto {
  @ApiProperty({ example: '2003-05-19', description: 'Date de naissance (ISO)' })
  @IsDateString(
    {},
    { message: 'Date de naissance invalide (format attendu AAAA-MM-JJ).' },
  )
  dateNaissance: string;
  @ApiProperty({ enum: NiveauEtudes, example: NiveauEtudes.LICENCE })
  @IsEnum(NiveauEtudes, { message: "Niveau d'études invalide." })
  niveauEtudes: NiveauEtudes;
  @ApiProperty({
    example: true,
    description: 'true = en études (domaine + établissement) ; false = ni l\'un ni l\'autre',
  })
  @IsBoolean({ message: 'Le champ « en études » doit être un booléen.' })
  enEtudes: boolean;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: "Domaine d'études invalide." })
  domaineEtudesId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Établissement invalide.' })
  etablissementId?: string;
  @ApiPropertyOptional({
    example: 'Mon établissement hors liste',
    description: 'Texte libre si l\'établissement n\'est pas dans le référentiel',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  etablissementAutre?: string;
}

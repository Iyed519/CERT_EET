import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { RoleDemande } from '../../../database/enums/role-demande.enum';

/**
 * DTO de création d'une demande de changement de rôle (US-ROL-02).
 *
 * Corps de POST /role-requests. Le ValidationPipe global (whitelist:true +
 * forbidNonWhitelisted, main.ts) rejette en 400 tout champ non déclaré ici.
 *
 * `roleDemande` est typé par l'enum RESTREINT RoleDemande (FORMATEUR ou
 * ADMINISTRATEUR) : @IsEnum rejette donc en 400 toute autre valeur, y compris
 * APPRENANT — on ne demande que des montées en privilège.
 */
export class CreateRoleRequestDto {
  @ApiProperty({ enum: RoleDemande, example: RoleDemande.FORMATEUR })
  @IsEnum(RoleDemande, {
    message: 'Rôle demandé invalide : FORMATEUR ou ADMINISTRATEUR attendu.',
  })
  roleDemande: RoleDemande;

  @ApiProperty({
    example: 'Je conçois les TP du module réseau et souhaite les évaluer.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty({ message: 'La justification est requise.' })
  @MaxLength(1000, {
    message: 'La justification ne peut excéder 1000 caractères.',
  })
  justification: string;
}

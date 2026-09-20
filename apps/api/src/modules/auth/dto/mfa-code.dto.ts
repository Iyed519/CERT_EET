import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO commun aux actions MFA exigeant un code TOTP (US-AUTH-09) : confirmation
 * d'activation (/auth/mfa/enable) et desactivation (/auth/mfa/disable). Un code
 * TOTP est compose de 6 chiffres.
 */
export class MfaCodeDto {
  @ApiProperty({ example: '123456', description: 'Code TOTP a 6 chiffres.' })
  @IsString()
  @IsNotEmpty({ message: 'Le code est requis.' })
  @Matches(/^[0-9]{6}$/, { message: 'Le code doit comporter 6 chiffres.' })
  code: string;
}

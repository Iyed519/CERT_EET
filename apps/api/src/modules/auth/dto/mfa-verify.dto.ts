import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO de la seconde etape de connexion MFA (US-AUTH-02) : le jeton MFA
 * temporaire renvoye par /auth/login + le code TOTP a 6 chiffres.
 */
export class MfaVerifyDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Jeton MFA temporaire renvoye par /auth/login.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le jeton MFA est requis.' })
  mfaToken: string;

  @ApiProperty({ example: '123456', description: 'Code TOTP a 6 chiffres.' })
  @IsString()
  @IsNotEmpty({ message: 'Le code est requis.' })
  @Matches(/^[0-9]{6}$/, { message: 'Le code doit comporter 6 chiffres.' })
  code: string;
}

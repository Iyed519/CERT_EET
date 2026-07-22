import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
/**
 * DTO de vérification d'email (US-CPT-05).
 * Le token est l'UUID transmis dans le lien de l'email de vérification.
 * On valide sa forme (UUID v4) en amont : un jeton malformé est rejeté en 400
 * par le ValidationPipe avant même d'atteindre AuthService.
 */
export class VerifyEmailDto {
  @ApiProperty({ example: '25bff6d2-433d-4946-967d-a35471bd6ec9' })
  @IsNotEmpty({ message: 'Le jeton est requis.' })
  @IsUUID('4', { message: 'Jeton de vérification invalide.' })
  token: string;
}

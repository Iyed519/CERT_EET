import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { MotDePasseConforme } from './politique-mot-de-passe';

/** US-AUTH-06 — Corps de POST /auth/forgot-password. */
export class DemanderReinitialisationDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @MaxLength(255)
  email: string;
}

/** US-AUTH-06 — Corps de POST /auth/reset-password. */
export class ReinitialiserMotDePasseDto {
  @ApiProperty({ description: 'Jeton reçu dans le lien (base64url, 43 caractères).' })
  @IsString()
  @IsNotEmpty({ message: 'Le lien de réinitialisation est incomplet.' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'Le lien de réinitialisation est invalide.' })
  token: string;

  @ApiProperty({ example: 'NouveauMotDePasse2' })
  @MotDePasseConforme()
  nouveauMotDePasse: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MotDePasseConforme } from './politique-mot-de-passe';

/**
 * US-AUTH-08 — Corps de POST /auth/change-password. Le mot de passe actuel
 * n'est que comparé (aucune politique, mais une longueur bornée pour ne pas
 * faire hacher des mégaoctets) ; le nouveau suit la politique commune.
 */
export class ChangerMotDePasseDto {
  @ApiProperty({ example: 'AncienMotDePasse1' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe actuel est requis.' })
  @MaxLength(256)
  motDePasseActuel: string;

  @ApiProperty({ example: 'NouveauMotDePasse2' })
  @MotDePasseConforme()
  nouveauMotDePasse: string;
}

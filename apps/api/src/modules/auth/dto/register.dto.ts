import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
/**
 * DTO d'auto-inscription publique (US-CPT-05, ADR-11).
 *
 * Décrit le corps attendu de POST /auth/register. Le ValidationPipe global
 * (main.ts, whitelist:true) applique ces règles AVANT le contrôleur et retire
 * tout champ non déclaré ici — donc un éventuel champ "role" envoyé par le
 * client est silencieusement supprimé (1re barrière anti-élévation de privilège ;
 * la 2e est le rôle forcé APPRENANT dans AuthService).
 *
 * Contrairement à LoginDto, on IMPOSE ici une politique de mot de passe : on le
 * CRÉE, ce n'est pas une simple vérification. Règle volontairement simple
 * (min 8, au moins une lettre et un chiffre) — durcissable plus tard.
 */
export class RegisterDto {
  @ApiProperty({ example: 'Omri' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis.' })
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères.' })
  nom: string;
  @ApiProperty({ example: 'Iyed' })
  @IsString()
  @IsNotEmpty({ message: 'Le prénom est requis.' })
  @MaxLength(100, { message: 'Le prénom ne doit pas dépasser 100 caractères.' })
  prenom: string;
  @ApiProperty({ example: 'utilisateur@example.com' })
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @IsNotEmpty({ message: "L'email est requis." })
  email: string;
  @ApiProperty({ example: 'MotDePasse123' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  })
  password: string;
}

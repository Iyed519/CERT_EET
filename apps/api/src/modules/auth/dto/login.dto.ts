import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO (Data Transfer Object) pour la connexion (US-AUTH-01).
 *
 * Décrit la forme attendue du corps de la requête POST /auth/login.
 * Le ValidationPipe global (main.ts) applique ces règles automatiquement
 * avant que le contrôleur ne soit même appelé : whitelist:true supprime
 * tout champ non déclaré ici, et une requête invalide est rejetée en 400
 * avant d'atteindre AuthService (fail-fast côté entrée).
 *
 * Volontairement minimal : aucune règle de complexité de mot de passe ici,
 * car à la connexion on ne fait que VÉRIFIER un mot de passe existant
 * (bcrypt.compare), pas en créer un. Les règles de complexité concernent
 * la création/changement de mot de passe (autres stories).
 */
export class LoginDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @IsNotEmpty({ message: "L'email est requis." })
  email: string;

  @ApiProperty({ example: 'MotDePasse123!' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  password: string;
}
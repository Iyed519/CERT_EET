import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../../database/enums/role.enum';

/**
 * DTO du changement de rôle par un administrateur (US-ROL-01).
 *
 * Corps de PATCH /admin/users/:id/role. Le ValidationPipe global
 * (whitelist:true + forbidNonWhitelisted, main.ts) rejette en 400 tout champ
 * non déclaré ici AVANT le contrôleur (fail-fast côté entrée).
 *
 * `motDePasseAdmin` : je réauthentifie l'admin sur cette action sensible
 * (step-up auth, ADR-08). Posséder un access token valide ne suffit pas à
 * changer un rôle — le mot de passe est revérifié (bcrypt.compare) dans le
 * service.
 */
export class ChangeRoleDto {
  @ApiProperty({ enum: Role, example: Role.FORMATEUR })
  @IsEnum(Role, { message: 'Rôle cible invalide.' })
  nouveauRole: Role;

  @ApiProperty({ example: 'MotDePasseAdmin123!' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe administrateur est requis.' })
  motDePasseAdmin: string;
}

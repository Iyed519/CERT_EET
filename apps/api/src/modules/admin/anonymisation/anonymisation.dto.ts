import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Mot à recopier pour confirmer une anonymisation (irréversible). */
export const MOT_CONFIRMATION_ANONYMISATION = 'ANONYMISER';

/**
 * US-CPT-04 — Corps de POST /admin/users/:id/anonymiser : double
 * confirmation explicite — mot de passe de l'administrateur (réauthentification)
 * ET mot « ANONYMISER » recopié.
 */
export class AnonymiserCompteDto {
  @ApiProperty({ description: "Mot de passe de l'administrateur (réauthentification)." })
  @IsString()
  @IsNotEmpty({ message: 'Votre mot de passe administrateur est requis.' })
  @MaxLength(256)
  motDePasseAdmin: string;

  @ApiProperty({ example: MOT_CONFIRMATION_ANONYMISATION })
  @Equals(MOT_CONFIRMATION_ANONYMISATION, {
    message: `Recopiez « ${MOT_CONFIRMATION_ANONYMISATION} » pour confirmer cette action irréversible.`,
  })
  confirmation: string;
}

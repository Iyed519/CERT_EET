import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Politique de mot de passe partagée par tout endpoint qui DÉFINIT un mot de
 * passe (changement US-AUTH-08, réinitialisation US-AUTH-06). Même règle que
 * l'auto-inscription (US-CPT-05) : au moins 8 caractères, au moins une lettre
 * et un chiffre ; plafond de 72 caractères, la limite utile de bcrypt (au-delà,
 * les caractères seraient ignorés sans que l'utilisateur le sache).
 */
export const MOT_DE_PASSE_LONGUEUR_MIN = 8;
export const MOT_DE_PASSE_LONGUEUR_MAX = 72;

export function MotDePasseConforme(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: 'Le nouveau mot de passe est requis.' }),
    MinLength(MOT_DE_PASSE_LONGUEUR_MIN, {
      message: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`,
    }),
    MaxLength(MOT_DE_PASSE_LONGUEUR_MAX, {
      message: `Le mot de passe ne doit pas dépasser ${MOT_DE_PASSE_LONGUEUR_MAX} caractères.`,
    }),
    Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
      message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
    }),
  );
}

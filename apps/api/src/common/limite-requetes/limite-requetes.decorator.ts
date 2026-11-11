import { SetMetadata } from '@nestjs/common';
import { LimiteRequetes } from './limite-requetes.regles';

export const LIMITE_REQUETES_KEY = 'limiteRequetes';

/**
 * Pose une limite de débit sur une route (avec `@UseGuards(LimiteRequetesGuard)`).
 * Exemple : `@AppliquerLimite({ nom: 'mdp-oublie', limite: 5, fenetreSecondes: 900 })`.
 */
export const AppliquerLimite = (limite: LimiteRequetes): MethodDecorator & ClassDecorator =>
  SetMetadata(LIMITE_REQUETES_KEY, limite);

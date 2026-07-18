import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { Role } from '../../../database/enums/role.enum';

/** Clé de métadonnée portant la liste des rôles autorisés. */
export const ROLES_KEY = 'roles';

/**
 * @Roles(Role.FORMATEUR, ...) — déclare les rôles autorisés sur une route.
 * Ne fait qu'attacher la métadonnée ; c'est RolesGuard qui l'applique.
 */
export const Roles = (...roles: Role[]): CustomDecorator =>
  SetMetadata(ROLES_KEY, roles);

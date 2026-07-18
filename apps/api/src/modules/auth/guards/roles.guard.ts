import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../database/enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth.types';

/**
 * RolesGuard — autorisation (US-AUTH-11). S'exécute APRÈS JwtAuthGuard.
 *
 * Lit les rôles requis posés par @Roles(...) et les compare au rôle de
 * l'utilisateur (déjà attaché à req.user). Aucune contrainte -> route
 * simplement authentifiée. Rôle insuffisant -> 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Accès refusé : rôle insuffisant.');
    }
    return true;
  }
}

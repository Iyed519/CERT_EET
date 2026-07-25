import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminUsersService, UserAdminVue } from './admin-users.service';
import { ChangeRoleDto } from './dto/change-role.dto';

/**
 * Console d'administration des utilisateurs (US-ROL-01).
 *
 * @Roles(ADMINISTRATEUR) au niveau CLASSE : le RolesGuard global (US-AUTH-11)
 * refuse tout autre rôle en 403 sur toutes les routes. Aucune route @Public ->
 * le JwtAuthGuard global exige déjà une session valide.
 */
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs (US-ROL-01)' })
  @ApiResponse({ status: 200, description: 'Utilisateurs triés par email.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  listUsers(): Promise<UserAdminVue[]> {
    return this.adminUsersService.listUsers();
  }

  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer le rôle d\'un utilisateur (US-ROL-01)' })
  @ApiResponse({
    status: 200,
    description: 'Rôle mis à jour ; sessions de la cible invalidées.',
  })
  @ApiResponse({ status: 400, description: 'L\'utilisateur possède déjà ce rôle.' })
  @ApiResponse({ status: 401, description: 'Mot de passe administrateur invalide.' })
  @ApiResponse({
    status: 403,
    description: 'Dernier administrateur actif : rétrogradation refusée.',
  })
  @ApiResponse({ status: 404, description: 'Utilisateur cible introuvable.' })
  async changeRole(
    @Param('id', ParseUUIDPipe) cibleId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserAdminVue> {
    const admin = req.user;
    if (!admin) {
      // Filet de sécurité : le JwtAuthGuard garantit déjà req.user, mais le
      // typage TS l'ignore.
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.adminUsersService.changeRole(admin.sub, cibleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }
}

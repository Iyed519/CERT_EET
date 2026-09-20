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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminUsersService, UserAdminVue } from './admin-users.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeStatutDto } from './dto/change-statut.dto';

/**
 * Console d'administration des utilisateurs (US-ROL-01, US-CPT-03).
 *
 * @Roles(ADMINISTRATEUR) au niveau CLASSE : le RolesGuard global (US-AUTH-11)
 * refuse tout autre rôle en 403 sur toutes les routes. Aucune route @Public ->
 * le JwtAuthGuard global exige déjà une session valide.
 */
@ApiBearerAuth('access-token')
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

  /**
   * US-CPT-03 — Activer / désactiver un compte.
   *
   * Route de gestion de compte sur la ressource `:id` (PAS de sous-route
   * `/statut`) : le corps `{ statut, motif? }` porte l'intention. Le corps est
   * validé (ChangeStatutDto) AVANT d'entrer ici ; on se contente d'aiguiller
   * vers la bonne opération du service selon le statut demandé.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer / désactiver un compte (US-CPT-03)' })
  @ApiResponse({ status: 200, description: 'Statut du compte mis à jour.' })
  @ApiResponse({
    status: 400,
    description: 'Motif manquant, ou statut déjà appliqué.',
  })
  @ApiResponse({
    status: 403,
    description: 'Dernier administrateur actif : désactivation refusée.',
  })
  @ApiResponse({ status: 404, description: 'Utilisateur cible introuvable.' })
  async changeStatut(
    @Param('id', ParseUUIDPipe) cibleId: string,
    @Body() dto: ChangeStatutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserAdminVue> {
    const admin = req.user;
    if (!admin) {
      throw new UnauthorizedException('Non authentifié.');
    }
    const context = { adresseIp: req.ip ?? null };
    if (dto.statut === StatutCompte.DESACTIVE) {
      // Le ValidationPipe garantit motif non vide quand statut === DESACTIVE ;
      // le `?? ''` n'est qu'un filet pour le typage (jamais atteint en pratique).
      return this.adminUsersService.desactiverCompte(
        admin.sub,
        cibleId,
        dto.motif ?? '',
        context,
      );
    }
    return this.adminUsersService.reactiverCompte(admin.sub, cibleId, context);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  DemandeRoleAdminVue,
  DemandeRolePage,
  RoleRequestsService,
} from './role-requests.service';
import { ListRoleRequestsDto } from './dto/list-role-requests.dto';
import { RejectRoleRequestDto } from './dto/reject-role-request.dto';

/**
 * Traitement des demandes de rôle — côté ADMINISTRATEUR (US-ROL-02, étape C).
 *
 * @Roles(ADMINISTRATEUR) au niveau CLASSE : le RolesGuard global refuse tout
 * autre rôle en 403 ; le JwtAuthGuard global exige déjà une session valide.
 * Contrôleur SÉPARÉ du contrôleur utilisateur (RoleRequestsController) : les
 * deux vivent dans le même module mais n'ont ni le même préfixe de route ni la
 * même protection.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/role-requests')
export class AdminRoleRequestsController {
  constructor(private readonly roleRequestsService: RoleRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les demandes de rôle (US-ROL-02)' })
  @ApiResponse({
    status: 200,
    description: 'Demandes paginées { items, total, page, limit }, tri DESC.',
  })
  @ApiResponse({ status: 400, description: 'Filtre invalide (statut, page…).' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  list(@Query() query: ListRoleRequestsDto): Promise<DemandeRolePage> {
    return this.roleRequestsService.listerAdmin(query);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approuver une demande de rôle (US-ROL-02)' })
  @ApiResponse({
    status: 200,
    description: 'Rôle appliqué + sessions cible invalidées ; demande APPROUVEE.',
  })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Demande introuvable.' })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée.' })
  async approuver(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DemandeRoleAdminVue> {
    const admin = req.user;
    if (!admin) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.roleRequestsService.approuver(admin.sub, id, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rejeter une demande de rôle avec motif (US-ROL-02)' })
  @ApiResponse({ status: 200, description: 'Demande REJETEE ; audit tracé.' })
  @ApiResponse({ status: 400, description: 'Motif manquant.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Demande introuvable.' })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée.' })
  async rejeter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRoleRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DemandeRoleAdminVue> {
    const admin = req.user;
    if (!admin) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.roleRequestsService.rejeter(admin.sub, id, dto.motif, {
      adresseIp: req.ip ?? null,
    });
  }
}

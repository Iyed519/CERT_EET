import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  DemandeRoleVue,
  RoleRequestsService,
} from './role-requests.service';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';

/**
 * Demandes de changement de rôle — côté utilisateur (US-ROL-02).
 *
 * AUCUN @Roles ici : ces routes sont ouvertes à TOUT utilisateur authentifié
 * (le JwtAuthGuard global exige déjà une session valide -> 401 sans token).
 * C'est le pendant self-service d'US-ROL-01 (réservé, lui, aux admins).
 */
@ApiTags('role-requests')
@Controller('role-requests')
export class RoleRequestsController {
  constructor(private readonly roleRequestsService: RoleRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Soumettre une demande de changement de rôle (US-ROL-02)' })
  @ApiResponse({ status: 201, description: 'Demande créée au statut EN_ATTENTE.' })
  @ApiResponse({ status: 400, description: 'Rôle déjà détenu, ou justification invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 409, description: 'Une demande est déjà en attente.' })
  async creer(
    @Body() dto: CreateRoleRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DemandeRoleVue> {
    const user = req.user;
    if (!user) {
      // Filet : le JwtAuthGuard garantit déjà req.user, mais le typage l'ignore.
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.roleRequestsService.creer(user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Lister mes demandes de changement de rôle (US-ROL-02)' })
  @ApiResponse({ status: 200, description: 'Mes demandes, la plus récente d\'abord.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  async listerMes(
    @Req() req: AuthenticatedRequest,
  ): Promise<DemandeRoleVue[]> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.roleRequestsService.listerMes(user.sub);
  }
}

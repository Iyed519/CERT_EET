import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateModuleDto } from './dto/create-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { FormationModulesService } from './formation-modules.service';
import { ModuleVue } from './formations.service';

/**
 * Gestion des modules d'une formation — côté ADMINISTRATEUR (US-FORM-01).
 *
 * Routes imbriquées sous la formation : l'URL porte toujours la formation
 * concernée, et le service vérifie que le module lui appartient. @Roles au
 * niveau CLASSE, comme AdminFormationsController.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/formations/:formationId/modules')
export class AdminFormationModulesController {
  constructor(private readonly modulesService: FormationModulesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter un module en fin de formation (US-FORM-01)' })
  @ApiResponse({ status: 201, description: 'Module créé en dernière position ; audit MODULE_CREE.' })
  @ApiResponse({ status: 400, description: 'Titre manquant ou trop long, champ inconnu.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  async ajouter(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: CreateModuleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue> {
    const admin = this.exigerAdmin(req);
    return this.modulesService.ajouter(admin.sub, formationId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Put('ordre')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réordonner tous les modules de la formation (US-FORM-01)' })
  @ApiResponse({ status: 200, description: 'Modules dans leur nouvel ordre (1, 2, 3…).' })
  @ApiResponse({
    status: 400,
    description: 'Liste incomplète, avec doublon, ou contenant un module étranger.',
  })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  async reordonner(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: ReorderModulesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue[]> {
    const admin = this.exigerAdmin(req);
    return this.modulesService.reordonner(admin.sub, formationId, dto.moduleIds, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch(':moduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier le titre ou la description d’un module (US-FORM-01)' })
  @ApiResponse({ status: 200, description: 'Module modifié ; audit MODULE_MODIFIE.' })
  @ApiResponse({ status: 400, description: 'Aucune modification, ou titre vidé.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation ou module introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  async modifier(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: UpdateModuleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue> {
    const admin = this.exigerAdmin(req);
    return this.modulesService.modifier(admin.sub, formationId, moduleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Delete(':moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un module et renuméroter les suivants (US-FORM-01)' })
  @ApiResponse({ status: 204, description: 'Module supprimé ; audit MODULE_SUPPRIME.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation ou module introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou module contenant déjà une évaluation.',
  })
  async supprimer(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const admin = this.exigerAdmin(req);
    await this.modulesService.supprimer(admin.sub, formationId, moduleId, {
      adresseIp: req.ip ?? null,
    });
  }

  /** Filet : le JwtAuthGuard garantit déjà req.user, mais le typage l'ignore. */
  private exigerAdmin(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }
}

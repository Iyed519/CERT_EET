import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateFormationDto } from './dto/create-formation.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';
import { FormationVue, FormationsService } from './formations.service';

/**
 * Gestion des formations — côté ADMINISTRATEUR (US-FORM-01, DS-16 P1).
 *
 * @Roles(ADMINISTRATEUR) au niveau CLASSE : le RolesGuard global refuse tout
 * autre rôle en 403 ; le JwtAuthGuard global exige déjà une session valide.
 * Contrôleur SÉPARÉ du contrôleur de consultation (FormationsController) :
 * même module, mais ni le même préfixe de route ni la même protection — comme
 * pour les demandes de rôle.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/formations')
export class AdminFormationsController {
  constructor(private readonly formationsService: FormationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une formation (US-FORM-01)' })
  @ApiResponse({
    status: 201,
    description: 'Formation créée au statut OUVERTE, visible au catalogue ; audit FORMATION_CREEE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Paramètres invalides : capacité ≤ 0, seuil hors [0,100], titre vide, dates incohérentes, champ inconnu.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  async creer(
    @Body() dto: CreateFormationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationVue> {
    const admin = req.user;
    if (!admin) {
      // Filet : le JwtAuthGuard garantit déjà req.user, mais le typage l'ignore.
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.formationsService.creer(admin.sub, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier la configuration d’une formation (US-FORM-01)' })
  @ApiResponse({
    status: 200,
    description: 'Formation modifiée ; audit FORMATION_MODIFIEE (avant / après).',
  })
  @ApiResponse({
    status: 400,
    description:
      'Aucune modification, valeur invalide, champ obligatoire vidé, dates incohérentes, champ inconnu (statut).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou capacité inférieure au nombre d’inscrits.',
  })
  async modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationVue> {
    const admin = req.user;
    if (!admin) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.formationsService.modifier(admin.sub, id, dto, {
      adresseIp: req.ip ?? null,
    });
  }
}

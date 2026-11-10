import {
  Body,
  Controller,
  Get,
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
import { CycleFormationService, ImpactCycle } from './cycle-formation.service';
import { ChangerStatutFormationDto } from './dto/changer-statut-formation.dto';
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
  constructor(
    private readonly formationsService: FormationsService,
    private readonly cycleService: CycleFormationService,
  ) {}

  @Get(':id/cycle')
  @ApiOperation({
    summary: 'Impact d’un changement de statut (US-FORM-02, DS-16 P1)',
    description:
      'Statut, transitions possibles, inscriptions en cours, évaluations en cours (tentatives, ' +
      'livrables à corriger, corrections ouvertes, certificats en émission), certificats actifs.',
  })
  @ApiResponse({ status: 200, description: 'Impact.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  impact(@Param('id', ParseUUIDPipe) id: string): Promise<ImpactCycle> {
    return this.cycleService.impact(id);
  }

  @Post(':id/statut')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clôturer, archiver ou rouvrir une formation (US-FORM-02, DS-16 P1)',
    description:
      'OUVERTE -> FERMEE (plus d’inscription) -> ARCHIVEE (parcours figé, définitif) ; ' +
      'FERMEE -> OUVERTE. Si des évaluations sont en cours, clôturer ou archiver exige ' +
      '`confirmer: true`. Les certificats émis restent vérifiables.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statut changé ; audit FORMATION_CLOTUREE / _ARCHIVEE / _ROUVERTE.',
  })
  @ApiResponse({ status: 400, description: 'Statut ou confirmation invalide ; champ inconnu.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({
    status: 409,
    description:
      'Transition impossible (formation archivée, déjà dans ce statut…) ou CONFIRMATION_REQUISE.',
  })
  changerStatut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangerStatutFormationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.cycleService.changerStatut(req.user.sub, id, dto.statut, dto.confirmer === true, {
      adresseIp: req.ip ?? null,
    });
  }

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

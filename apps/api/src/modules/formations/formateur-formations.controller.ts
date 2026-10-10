import { Controller, Get, Param, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from './autorisation/formateur-de-la-formation.decorator';
import { FormateurFormationsService, MaFormationVue } from './formateur-formations.service';
import { FormationDetailVue } from './formations.service';

/**
 * Espace formateur — « Mes formations » (US-AUTH-16).
 *
 * Première route protégée par @FormateurDeLaFormation : le détail d'une
 * formation n'est servi qu'à un formateur AFFECTÉ (ou à un administrateur).
 * Les routes des évaluations (US-QCM-01 et suivantes) poseront le même
 * décorateur.
 */
@ApiBearerAuth('access-token')
@ApiTags('formateur')
@Controller('formateur/formations')
export class FormateurFormationsController {
  constructor(private readonly formateurFormationsService: FormateurFormationsService) {}

  @Get()
  @Roles(Role.FORMATEUR)
  @ApiOperation({ summary: 'Lister mes formations affectées, tous statuts (US-AUTH-16)' })
  @ApiResponse({
    status: 200,
    description: 'Formations affectées au formateur connecté, la plus récente d’abord.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (réservé aux formateurs).' })
  mesFormations(@Req() req: AuthenticatedRequest): Promise<MaFormationVue[]> {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.formateurFormationsService.mesFormations(req.user.sub);
  }

  @Get(':formationId')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({
    summary: 'Consulter une de mes formations et ses modules, tous statuts (US-AUTH-16)',
  })
  @ApiResponse({ status: 200, description: 'Formation + modules triés par ordre.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Rôle insuffisant, ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  detail(@Param('formationId', ParseUUIDPipe) formationId: string): Promise<FormationDetailVue> {
    return this.formateurFormationsService.detail(formationId);
  }
}

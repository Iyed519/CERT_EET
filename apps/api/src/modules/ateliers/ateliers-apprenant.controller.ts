import { Controller, Get, Param, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AtelierApprenantVue, AteliersApprenantService } from './ateliers-apprenant.service';

/**
 * Ateliers — côté APPRENANT (US-ATEL-03). Contrôleur à part d'AteliersController,
 * dont le @Roles de classe est réservé aux formateurs et administrateurs. La
 * liste des ateliers publiés arrive avec « Mon espace »
 * (`GET /formations/:formationId/mon-espace`) ; ici, la fiche d'un atelier,
 * sous `/mes-ateliers` comme `/mes-inscriptions`. L'apprenant est toujours
 * celui du jeton.
 */
@ApiBearerAuth('access-token')
@ApiTags('ateliers')
@Roles(Role.APPRENANT)
@Controller()
export class AteliersApprenantController {
  constructor(private readonly ateliersApprenantService: AteliersApprenantService) {}

  @Get('mes-ateliers/:atelierId')
  @ApiOperation({
    summary: 'Consulter un atelier publié de ma formation, avec sa grille (US-ATEL-03)',
    description:
      'Énoncé, compétences visées, date limite et tolérance, modalités de dépôt, état du ' +
      'dépôt (OUVERT, EN_RETARD, CLOS — horloge PostgreSQL) et grille de notation en lecture.',
  })
  @ApiResponse({ status: 200, description: 'Fiche de l’atelier et sa grille.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Rôle autre qu’apprenant, pas inscrit à la formation, ou inscription suspendue (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'Atelier introuvable ou pas encore publié.' })
  fiche(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AtelierApprenantVue> {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.ateliersApprenantService.fiche(req.user.sub, atelierId, {
      adresseIp: req.ip ?? null,
      methode: req.method,
      route: req.originalUrl,
    });
  }
}

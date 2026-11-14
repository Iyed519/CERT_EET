import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompteursNavigation, EvaluationsFormateur, NavigationService } from './navigation.service';

/**
 * US-UX-02 — Lecture seule pour la navigation latérale : compteurs du menu
 * (formateur ou administrateur) et pages d'ensemble « Livrables à corriger » /
 * « Tentatives des QCM » du formateur. Aucune écriture, aucune trace.
 */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Controller()
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Get('navigation/compteurs')
  @ApiOperation({
    summary: 'Compteurs du menu latéral (US-UX-02)',
    description:
      'Formateur (ses formations affectées) : alertes de décrochage ouvertes, alertes de ' +
      'surveillance à examiner, livrables à corriger, tentatives à évaluer. Administrateur : ' +
      'demandes de rôle, demandes d’affectation et propositions en attente. Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Compteurs du rôle.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant.' })
  compteurs(@Req() req: AuthenticatedRequest): Promise<CompteursNavigation> {
    if (!req.user) throw new UnauthorizedException();
    return this.navigation.compteurs({ id: req.user.sub, role: req.user.role });
  }

  @Roles(Role.FORMATEUR)
  @Get('formateur/evaluations')
  @ApiOperation({
    summary: 'Ateliers et QCM du formateur, avec leurs comptes (US-UX-02)',
    description:
      'Pour chaque atelier de ses formations affectées : livrables à corriger, en correction, ' +
      'notés ; pour chaque QCM : tentatives, à évaluer, alertes de surveillance à examiner. ' +
      'Lecture seule.',
  })
  @ApiResponse({ status: 200, description: '`{ ateliers, qcm }`.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre que formateur.' })
  evaluations(@Req() req: AuthenticatedRequest): Promise<EvaluationsFormateur> {
    if (!req.user) throw new UnauthorizedException();
    return this.navigation.evaluations(req.user.sub);
  }
}

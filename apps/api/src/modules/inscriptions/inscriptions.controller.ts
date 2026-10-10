import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { InscriptionsService, InscriptionVue } from './inscriptions.service';

/**
 * Inscription aux formations — côté APPRENANT (US-INSC-01, DS-08).
 *
 * @Roles au niveau CLASSE : seul un apprenant s'inscrit et consulte ses
 * inscriptions. L'apprenant est TOUJOURS celui du jeton : aucune route ne
 * prend un identifiant d'apprenant, on ne peut pas inscrire quelqu'un d'autre.
 *
 * Deux préfixes : l'inscription est une sous-ressource de la formation
 * (`/formations/:formationId/inscriptions`, comme les modules et les
 * formateurs), la liste personnelle vit sous `/mes-inscriptions`.
 */
@ApiBearerAuth('access-token')
@ApiTags('inscriptions')
@Roles(Role.APPRENANT)
@Controller()
export class InscriptionsController {
  constructor(private readonly inscriptionsService: InscriptionsService) {}

  @Post('formations/:formationId/inscriptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'M’inscrire à une formation ouverte (US-INSC-01)' })
  @ApiResponse({
    status: 201,
    description:
      'Inscription créée (EN_COURS, échéance = date de fin), email de bienvenue au mieux ; audit INSCRIPTION_CREEE.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (réservé aux apprenants).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable ou non ouverte.' })
  @ApiResponse({
    status: 409,
    description: 'Déjà inscrit, inscription suspendue, ou formation complète.',
  })
  inscrire(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<InscriptionVue> {
    const apprenant = this.exigerUtilisateur(req);
    return this.inscriptionsService.inscrire(apprenant.sub, formationId, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get('mes-inscriptions')
  @ApiOperation({ summary: 'Lister mes inscriptions, tous statuts (US-INSC-01)' })
  @ApiResponse({ status: 200, description: 'Mes inscriptions, la plus récente d’abord.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (réservé aux apprenants).' })
  mesInscriptions(@Req() req: AuthenticatedRequest): Promise<InscriptionVue[]> {
    const apprenant = this.exigerUtilisateur(req);
    return this.inscriptionsService.mesInscriptions(apprenant.sub);
  }

  private exigerUtilisateur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }
}

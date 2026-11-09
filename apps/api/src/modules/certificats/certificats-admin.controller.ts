import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FiltreCertificatsDto } from './certificats.dto';
import { CertificatAdminVue, CertificatsService } from './certificats.service';

/**
 * Suivi de l'émission des certificats — ADMINISTRATEUR (US-CERT-01, DS-04
 * « échec définitif : réessai manuel »). La demande d'émission elle-même
 * n'a pas de route : elle vient de l'éligibilité (US-ATEL-09).
 */
@ApiBearerAuth('access-token')
@ApiTags('certificats')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/certificats')
export class CertificatsAdminController {
  constructor(private readonly certificatsService: CertificatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister les certificats et l’état de leur émission (US-CERT-01)',
    description: 'Plus récents d’abord, 200 au plus ; filtre facultatif `statut`.',
  })
  @ApiResponse({ status: 200, description: 'Certificats (statut, tentatives, dernière erreur).' })
  @ApiResponse({ status: 400, description: 'Statut inconnu.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  lister(@Query() filtre: FiltreCertificatsDto): Promise<CertificatAdminVue[]> {
    return this.certificatsService.lister(filtre.statut);
  }

  @Post(':certificatId/relancer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Relancer la génération d’un certificat en attente ou bloqué (US-CERT-01)',
  })
  @ApiResponse({ status: 200, description: 'Travail ajouté à la file ; audit CERTIFICAT_RELANCE.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Certificat introuvable.' })
  @ApiResponse({ status: 409, description: 'Certificat déjà actif ou révoqué.' })
  relancer(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CertificatAdminVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.certificatsService.relancer(req.user.sub, certificatId, {
      adresseIp: req.ip ?? null,
    });
  }
}

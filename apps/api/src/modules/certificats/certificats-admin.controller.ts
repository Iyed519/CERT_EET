import {
  Body,
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
import { FiltreCertificatsDto, RevoquerCertificatDto } from './certificats.dto';
import { CertificatAdminVue, CertificatsService } from './certificats.service';
import { EligibiliteService } from './eligibilite.service';

/**
 * Suivi de l'émission des certificats — ADMINISTRATEUR (US-CERT-01, DS-04
 * « échec définitif : réessai manuel »). La demande d'émission elle-même
 * n'a pas de route : elle vient de l'éligibilité (US-ATEL-09), que
 * l'administrateur peut aussi relancer pour toute une formation.
 */
@ApiBearerAuth('access-token')
@ApiTags('certificats')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin')
export class CertificatsAdminController {
  constructor(
    private readonly certificatsService: CertificatsService,
    private readonly eligibiliteService: EligibiliteService,
  ) {}

  @Get('certificats')
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

  @Post('certificats/:certificatId/relancer')
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

  @Post('certificats/:certificatId/revoquer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Révoquer un certificat émis — irréversible (US-CERT-06, DS-07)',
    description:
      'Double confirmation : case d’irréversibilité et mot de passe de l’administrateur. ' +
      'Le PDF et l’empreinte sont conservés ; la vérification publique affiche « Révoqué » ' +
      'immédiatement ; le titulaire est prévenu par email (motif, date).',
  })
  @ApiResponse({ status: 200, description: 'Certificat révoqué ; audit CERTIFICAT_REVOQUE.' })
  @ApiResponse({ status: 400, description: 'Motif, description ou confirmation invalides.' })
  @ApiResponse({ status: 401, description: 'Non authentifié ou mot de passe invalide.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Certificat introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà révoqué, ou encore en préparation.' })
  revoquer(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Body() dto: RevoquerCertificatDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CertificatAdminVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.certificatsService.revoquer(req.user.sub, certificatId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('formations/:formationId/certification/evaluer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réévaluer l’éligibilité de tous les inscrits d’une formation (US-ATEL-09)',
    description:
      'Pour chaque inscription EN_COURS ou TERMINEE : si tous les QCM publiés sont réussis et ' +
      'tous les ateliers publiés notés au-dessus du seuil de certification, l’émission est ' +
      'demandée (une seule fois par apprenant). Utile pour des notes antérieures.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Bilan { evalues, eligibles, declenches } ; audit CERTIFICATION_FORMATION_EVALUEE.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  evaluerFormation(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ evalues: number; eligibles: number; declenches: number }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.eligibiliteService.evaluerFormation(req.user.sub, formationId, {
      adresseIp: req.ip ?? null,
    });
  }
}

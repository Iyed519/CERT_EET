import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CertificatsService, MonCertificatVue } from './certificats.service';

/**
 * « Mes certificats » — côté APPRENANT (US-CERT-03, UC Apprenant). Le
 * titulaire est toujours celui du jeton : aucune route ne prend d'identifiant
 * d'apprenant.
 */
@ApiBearerAuth('access-token')
@ApiTags('certificats')
@Roles(Role.APPRENANT)
@Controller('mes-certificats')
export class CertificatsApprenantController {
  constructor(private readonly certificatsService: CertificatsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister mes certificats (US-CERT-03)' })
  @ApiResponse({
    status: 200,
    description:
      'Mes certificats, plus récents d’abord : formation, statut, score, mention, dates ; ' +
      'empreinte SHA-256 et lien public de vérification une fois émis.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  lister(@Req() req: AuthenticatedRequest): Promise<MonCertificatVue[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.certificatsService.mesCertificats(req.user.sub);
  }

  @Get(':certificatId/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Télécharger le PDF de mon certificat (US-CERT-03)' })
  @ApiResponse({ status: 200, description: 'PDF du certificat ; audit CERTIFICAT_TELECHARGE.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Certificat inconnu, ou certificat d’un autre apprenant (même réponse).',
  })
  @ApiResponse({ status: 409, description: 'Certificat en cours d’émission, ou révoqué.' })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  async pdf(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const pdf = await this.certificatsService.monPdf(req.user.sub, certificatId, {
      adresseIp: req.ip ?? null,
    });
    return new StreamableFile(pdf.flux, {
      type: 'application/pdf',
      ...(pdf.taille !== null ? { length: pdf.taille } : {}),
      disposition: `attachment; filename="${pdf.nomFichier}"`,
    });
  }
}

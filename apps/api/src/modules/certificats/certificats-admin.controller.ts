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
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  FiltreCertificatsDto,
  ReemettreCertificatDto,
  RevoquerCertificatDto,
} from './certificats.dto';
import { CertificatsService } from './certificats.service';
import { EligibiliteService } from './eligibilite.service';
import {
  CertificatSupervisionVue,
  FicheCertificat,
  SupervisionCertificatsService,
} from './supervision-certificats.service';

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
    private readonly supervisionService: SupervisionCertificatsService,
  ) {}

  @Get('certificats')
  @ApiOperation({
    summary: 'Superviser les certificats (US-CERT-01, US-DASH-02)',
    description:
      'Plus récents d’abord, 200 au plus ; filtres facultatifs `statut`, `recherche` et ' +
      '`enEchec=true` (US-CERT-02 : échecs définitifs) ' +
      '(titulaire, formation, identifiant). Chaque certificat porte son nombre de ' +
      'consultations publiques (journal d’audit CERTIFICAT_VERIFIE).',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificats (titulaire, formation, score, statut, consultations, émission).',
  })
  @ApiResponse({ status: 400, description: 'Statut inconnu ou recherche trop longue.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  lister(@Query() filtre: FiltreCertificatsDto): Promise<CertificatSupervisionVue[]> {
    return this.supervisionService.lister(
      filtre.statut,
      filtre.recherche,
      filtre.enEchec === 'true',
    );
  }

  @Get('certificats/:certificatId')
  @ApiOperation({
    summary: 'Fiche détaillée d’un certificat (US-DASH-02, DS-16 P3)',
    description:
      'Certificat (empreinte SHA-256 comprise), consultations publiques (total, valides, ' +
      'refusées, 20 dernières : date et verdict, sans adresse IP) et historique des ' +
      'actions d’audit visant le certificat. Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Fiche.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Certificat introuvable.' })
  fiche(@Param('certificatId', ParseUUIDPipe) certificatId: string): Promise<FicheCertificat> {
    return this.supervisionService.fiche(certificatId);
  }

  @Get('certificats/:certificatId/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'PDF d’un certificat, pour l’administrateur (US-CERT-09)',
    description:
      'Même fichier que celui de l’apprenant, pour tout certificat généré (actif, expiré ou ' +
      'révoqué). Affiché dans le navigateur. Consultation journalisée ' +
      '(CERTIFICAT_PDF_CONSULTE_ADMIN).',
  })
  @ApiResponse({ status: 200, description: 'PDF du certificat.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Certificat introuvable.' })
  @ApiResponse({ status: 409, description: 'Certificat pas encore généré.' })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  async pdf(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const pdf = await this.certificatsService.pdfAdmin(req.user.sub, certificatId, {
      adresseIp: req.ip ?? null,
    });
    return new StreamableFile(pdf.flux, {
      type: 'application/pdf',
      ...(pdf.taille !== null ? { length: pdf.taille } : {}),
      disposition: `inline; filename="${pdf.nomFichier}"`,
    });
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
  async relancer(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CertificatSupervisionVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const vue = await this.certificatsService.relancer(req.user.sub, certificatId, {
      adresseIp: req.ip ?? null,
    });
    return this.supervisionService.enrichirUne(vue);
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
  async revoquer(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Body() dto: RevoquerCertificatDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CertificatSupervisionVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const vue = await this.certificatsService.revoquer(req.user.sub, certificatId, dto, {
      adresseIp: req.ip ?? null,
    });
    return this.supervisionService.enrichirUne(vue);
  }

  @Post('certificats/:certificatId/reemettre')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Réémettre un certificat révoqué pour erreur (US-CERT-08, DS-07 -> DS-04)',
    description:
      'Seulement un certificat REVOQUE pour ERREUR_ADMIN, une seule fois. Un NOUVEAU certificat ' +
      '(mêmes titulaire, formation, score, mention) est créé et généré ; le révoqué reste ' +
      'tel quel et sa vérification publique renvoie vers le nouveau.',
  })
  @ApiResponse({
    status: 201,
    description: 'Nouveau certificat en file ; audit CERTIFICAT_REEMIS.',
  })
  @ApiResponse({
    status: 400,
    description: 'Confirmation absente ou fausse, identifiant mal formé.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  @ApiResponse({ status: 404, description: 'Certificat introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Pas révoqué, révoqué pour un autre motif, ou déjà réémis.',
  })
  async reemettre(
    @Param('certificatId', ParseUUIDPipe) certificatId: string,
    @Body() _dto: ReemettreCertificatDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CertificatSupervisionVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const vue = await this.certificatsService.reemettre(req.user.sub, certificatId, {
      adresseIp: req.ip ?? null,
    });
    return this.supervisionService.enrichirUne(vue);
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

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import {
  DeposerSupportDto,
  ErreursDepotSupportFilter,
  NettoyageSupportInterceptor,
  OPTIONS_DEPOT_SUPPORT,
} from './depot-support';
import { SupportDetailVue, SupportsService, SupportVue } from './supports.service';

/**
 * Supports pédagogiques de l'assistance IA (US-IA-01, DS-06 partie 1, UC10
 * Formateur). Formateur AFFECTÉ à la formation du module, ou administrateur
 * (@FormateurDeLaFormation, ADR-11). Routes sous le module, comme les
 * ateliers (DS-06 : `/formations/:id/supports` + moduleId dans le corps).
 * L'indexation est asynchrone : le dépôt répond 202 ; l'état se lit sur la
 * liste ou la fiche (SSE = US-IA-07, hors périmètre).
 */
@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class SupportsController {
  constructor(private readonly supportsService: SupportsService) {}

  @Post('modules/:moduleId/supports')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @UseFilters(ErreursDepotSupportFilter)
  @UseInterceptors(NettoyageSupportInterceptor, FileInterceptor('fichier', OPTIONS_DEPOT_SUPPORT))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichier'],
      properties: {
        fichier: { type: 'string', format: 'binary' },
        titre: { type: 'string', maxLength: 200 },
      },
    },
  })
  @ApiOperation({
    summary: 'Déposer un support pédagogique à indexer (US-IA-01)',
    description:
      'PDF, PPTX, DOCX, TXT ou MD, 20 Mo au plus ; signature contrôlée ; SHA-256 ; dépôt sur ' +
      'MinIO ; statut EN_INDEXATION et travail d’indexation en file (extraction, découpage, ' +
      'embeddings, pgvector). Réponse immédiate ; email au déposant à la fin.',
  })
  @ApiResponse({
    status: 202,
    description: 'Support accepté, indexation en file ; audit SUPPORT_DEPOSE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Fichier absent, format non pris en charge, vide, trop volumineux, contenu non conforme à ' +
      'l’extension, titre invalide (rien n’est enregistré).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou ce fichier est déjà déposé dans le module.',
  })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  deposer(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Body() dto: DeposerSupportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SupportVue> {
    return this.supportsService.deposer(this.acteur(req), moduleId, fichier ?? null, dto.titre, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get('modules/:moduleId/supports')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Supports pédagogiques d’un module, avec leur état d’indexation' })
  @ApiResponse({ status: 200, description: 'Liste, du plus récent au plus ancien.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  lister(@Param('moduleId', ParseUUIDPipe) moduleId: string): Promise<SupportVue[]> {
    return this.supportsService.listerDuModule(moduleId);
  }

  @Get('supports/:supportId')
  @FormateurDeLaFormation({ supportId: 'supportId' })
  @ApiOperation({ summary: 'Fiche d’un support : état, motif d’échec, aperçu du texte extrait' })
  @ApiResponse({ status: 200, description: 'Fiche du support.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Support introuvable.' })
  detail(@Param('supportId', ParseUUIDPipe) supportId: string): Promise<SupportDetailVue> {
    return this.supportsService.detail(supportId);
  }

  @Post('supports/:supportId/reindexer')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ supportId: 'supportId' })
  @ApiOperation({ summary: 'Relancer l’indexation d’un support en échec' })
  @ApiResponse({
    status: 202,
    description: 'Indexation remise en file ; audit SUPPORT_REINDEXATION.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Support introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou support qui n’est pas en échec d’indexation.',
  })
  reindexer(
    @Param('supportId', ParseUUIDPipe) supportId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SupportVue> {
    return this.supportsService.reindexer(this.acteur(req), supportId, {
      adresseIp: req.ip ?? null,
    });
  }

  @Delete('supports/:supportId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ supportId: 'supportId' })
  @ApiOperation({ summary: 'Supprimer un support (fichier, passages et vecteurs)' })
  @ApiResponse({ status: 204, description: 'Support supprimé ; audit SUPPORT_SUPPRIME.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Support introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou support ayant servi à des générations.',
  })
  async supprimer(
    @Param('supportId', ParseUUIDPipe) supportId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.supportsService.supprimer(this.acteur(req), supportId, {
      adresseIp: req.ip ?? null,
    });
  }

  private acteur(req: AuthenticatedRequest): string {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return req.user.sub;
  }
}

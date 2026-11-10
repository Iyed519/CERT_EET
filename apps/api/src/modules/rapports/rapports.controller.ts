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
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { DemanderRapportSessionDto, FiltreRapportsDto } from './rapports.dto';
import { RapportVue, RapportsService } from './rapports.service';

/**
 * US-RPT-01 — Rapports de session exportés (DS-14 P3).
 *
 * La demande rend 202 tout de suite : le fichier est produit par la file
 * `rapports`. « Mes rapports » et le téléchargement sont réservés au
 * demandeur (un autre utilisateur reçoit 404, comme pour un rapport inconnu).
 */
@ApiBearerAuth('access-token')
@ApiTags('rapports')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class RapportsController {
  constructor(private readonly rapportsService: RapportsService) {}

  @Post('formateur/formations/:formationId/rapports')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({
    summary: 'Demander un rapport de session, CSV ou PDF (US-RPT-01, DS-14 P3)',
    description:
      'Portée GLOBAL (indicateurs et une ligne par apprenant), INDIVIDUEL (apprenantId) ou ' +
      'MODULE (moduleId). Génération en arrière-plan ; un email prévient le demandeur. ' +
      'Au plus 5 demandes par minute.',
  })
  @ApiResponse({ status: 202, description: 'Rapport EN_ATTENTE ; audit RAPPORT_DEMANDE.' })
  @ApiResponse({ status: 400, description: 'Format, portée ou identifiant invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant, ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Formation, apprenant inscrit ou module introuvable.' })
  @ApiResponse({ status: 429, description: 'Plus de 5 demandes dans la minute.' })
  demander(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: DemanderRapportSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RapportVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.rapportsService.demanderSession(req.user.sub, formationId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get('rapports')
  @ApiOperation({ summary: 'Mes rapports (50 plus récents) (US-RPT-01)' })
  @ApiResponse({ status: 200, description: 'Rapports du demandeur.' })
  @ApiResponse({ status: 400, description: 'Filtre invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant.' })
  mesRapports(
    @Query() filtre: FiltreRapportsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RapportVue[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.rapportsService.mesRapports(req.user.sub, filtre.formationId);
  }

  @Get('rapports/:rapportId')
  @ApiOperation({ summary: 'Un de mes rapports : statut (US-RPT-01)' })
  @ApiResponse({ status: 200, description: 'Rapport.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 404, description: 'Rapport inconnu, ou d’un autre utilisateur.' })
  monRapport(
    @Param('rapportId', ParseUUIDPipe) rapportId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RapportVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.rapportsService.monRapport(req.user.sub, rapportId);
  }

  @Get('rapports/:rapportId/fichier')
  @ApiProduces('text/csv', 'application/pdf')
  @ApiOperation({ summary: 'Télécharger un de mes rapports (US-RPT-01)' })
  @ApiResponse({ status: 200, description: 'Fichier ; audit RAPPORT_TELECHARGE.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 404, description: 'Rapport inconnu, ou d’un autre utilisateur.' })
  @ApiResponse({ status: 409, description: 'Rapport pas encore prêt, ou en échec.' })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  async fichier(
    @Param('rapportId', ParseUUIDPipe) rapportId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    const f = await this.rapportsService.fichier(req.user.sub, rapportId, {
      adresseIp: req.ip ?? null,
    });
    return new StreamableFile(f.flux, {
      type: f.type,
      ...(f.taille !== null ? { length: f.taille } : {}),
      disposition: `attachment; filename="${f.nomFichier}"`,
    });
  }
}

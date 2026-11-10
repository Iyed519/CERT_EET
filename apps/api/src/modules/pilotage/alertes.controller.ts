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
import { Audit } from '../audit/decorators/audit.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { AlertesDecrochageService, AlerteVue } from './alertes-decrochage.service';
import { FiltreAlertesDto, RouvrirAlerteDto, TraiterAlerteDto } from './alertes.dto';
import { AlerteDetail, TraitementAlertesService } from './traitement-alertes.service';

/**
 * US-SUIVI-02 — Alertes de décrochage (DS-14 P2). Le formateur ne voit que
 * les alertes des formations auxquelles il est affecté (filtre SQL sur
 * `formation_formateurs`) ; l'administrateur les voit toutes et peut lancer
 * un balayage à la demande.
 */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Controller()
export class AlertesController {
  constructor(
    private readonly alertes: AlertesDecrochageService,
    private readonly traitement: TraitementAlertesService,
  ) {}

  @Get('formateur/alertes')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @ApiOperation({
    summary: 'Mes alertes de décrochage (US-SUIVI-02)',
    description:
      'Plus récentes d’abord, 200 au plus ; filtres `statut` et `formationId`. Formateur : ' +
      'formations affectées seulement (une autre formation donne une liste vide).',
  })
  @ApiResponse({
    status: 200,
    description: 'Alertes (critère, faits, suggestion, apprenant, formation).',
  })
  @ApiResponse({ status: 400, description: 'Statut inconnu ou identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant.' })
  lister(
    @Query() filtre: FiltreAlertesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteVue[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.alertes.lister(req.user, filtre);
  }

  @Get('formateur/alertes/compteur')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @ApiOperation({ summary: 'Nombre d’alertes ouvertes (badge, US-SUIVI-02)' })
  @ApiResponse({ status: 200, description: '{ ouvertes }' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant.' })
  compteur(@Req() req: AuthenticatedRequest): Promise<{ ouvertes: number }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.alertes.compteur(req.user);
  }

  // Routes paramétrées APRÈS « compteur » (sinon « compteur » serait lu comme un identifiant).
  @Get('formateur/alertes/:alerteId')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @FormateurDeLaFormation({ alerteId: 'alerteId' })
  @ApiOperation({ summary: 'Une alerte et son historique d’actions (US-SUIVI-03)' })
  @ApiResponse({ status: 200, description: 'Alerte + historique (ordre chronologique).' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description: 'Apprenant, ou formateur non affecté (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'Alerte introuvable.' })
  detail(@Param('alerteId', ParseUUIDPipe) alerteId: string): Promise<AlerteDetail> {
    return this.traitement.detail(alerteId);
  }

  @Post('formateur/alertes/:alerteId/traiter')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @FormateurDeLaFormation({ alerteId: 'alerteId' })
  @ApiOperation({
    summary: 'Traiter une alerte : action menée, statut « Traitée » (US-SUIVI-03)',
  })
  @ApiResponse({ status: 200, description: 'Alerte traitée ; audit ALERTE_TRAITEE.' })
  @ApiResponse({ status: 400, description: 'Action vide ou trop longue ; identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant, ou formateur non affecté.' })
  @ApiResponse({ status: 404, description: 'Alerte introuvable.' })
  @ApiResponse({ status: 409, description: 'Alerte déjà traitée.' })
  traiter(
    @Param('alerteId', ParseUUIDPipe) alerteId: string,
    @Body() dto: TraiterAlerteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteDetail> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.traitement.traiter(req.user.sub, alerteId, dto.action, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('formateur/alertes/:alerteId/rouvrir')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @FormateurDeLaFormation({ alerteId: 'alerteId' })
  @ApiOperation({
    summary: 'Rouvrir une alerte traitée (motif), historique conservé (US-SUIVI-03)',
  })
  @ApiResponse({ status: 200, description: 'Alerte rouverte ; audit ALERTE_ROUVERTE.' })
  @ApiResponse({ status: 400, description: 'Motif vide ou trop long ; identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant, ou formateur non affecté.' })
  @ApiResponse({ status: 404, description: 'Alerte introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Alerte déjà ouverte, ou une autre alerte ouverte existe pour ce critère.',
  })
  rouvrir(
    @Param('alerteId', ParseUUIDPipe) alerteId: string,
    @Body() dto: RouvrirAlerteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteDetail> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.traitement.rouvrir(req.user.sub, alerteId, dto.motif, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('admin/alertes/balayer')
  @Roles(Role.ADMINISTRATEUR)
  @HttpCode(HttpStatus.OK)
  @Audit('ALERTES_BALAYAGE_DECLENCHE')
  @ApiOperation({
    summary: 'Lancer le balayage des alertes maintenant (US-SUIVI-02)',
    description: 'Même traitement que le balayage planifié ; idempotent.',
  })
  @ApiResponse({ status: 200, description: '{ creees }' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  async balayer(): Promise<{ creees: number }> {
    return { creees: (await this.alertes.balayer()).length };
  }
}

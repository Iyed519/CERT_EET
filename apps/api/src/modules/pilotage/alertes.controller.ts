import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AlertesDecrochageService, AlerteVue } from './alertes-decrochage.service';
import { FiltreAlertesDto } from './alertes.dto';

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
  constructor(private readonly alertes: AlertesDecrochageService) {}

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

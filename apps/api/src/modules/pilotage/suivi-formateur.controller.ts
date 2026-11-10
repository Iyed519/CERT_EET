import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { FicheApprenant, SuiviFormation, SuiviFormationService } from './suivi-formation.service';

/**
 * US-SUIVI-01 — Tableau de bord pédagogique d'une formation (DS-14 P1).
 * Formateur AFFECTÉ ou administrateur : @FormateurDeLaFormation refuse un
 * formateur non affecté (403 + audit ACCES_RESSOURCE_REFUSE).
 */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('formateur/formations/:formationId')
export class SuiviFormateurController {
  constructor(private readonly suiviService: SuiviFormationService) {}

  @Get('suivi')
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({
    summary: 'Suivi pédagogique d’une de mes formations (US-SUIVI-01, DS-14 P1)',
    description:
      'Indicateurs (inscrits, actifs, inactifs depuis plus de 7 jours, terminés, suspendus, ' +
      'taux de complétion, score moyen QCM, note moyenne ateliers, certifiés), histogramme des ' +
      'moyennes (10 tranches) et une ligne par apprenant (avancement, QCM, ateliers, dernière ' +
      'activité, risque). Évaluations publiées seulement. Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Suivi.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description: 'Apprenant, ou formateur non affecté (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  suivi(@Param('formationId', ParseUUIDPipe) formationId: string): Promise<SuiviFormation> {
    return this.suiviService.suivi(formationId);
  }

  @Get('apprenants/:apprenantId')
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({
    summary: 'Fiche d’un apprenant de ma formation (US-SUIVI-01, DS-14 P1)',
    description:
      'Ligne de suivi, tentatives QCM (date, durée, score), livrables (version, retard, note), ' +
      'certificat et chronologie. Les bonnes réponses ne sont jamais exposées. Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Fiche.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté.' })
  @ApiResponse({ status: 404, description: 'Formation introuvable ou apprenant non inscrit.' })
  fiche(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('apprenantId', ParseUUIDPipe) apprenantId: string,
  ): Promise<FicheApprenant> {
    return this.suiviService.fiche(formationId, apprenantId);
  }
}

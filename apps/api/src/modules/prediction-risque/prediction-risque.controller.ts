import { Controller, Get, Param, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import {
  PredictionRisqueService,
  ResumeRisqueFormation,
  RisqueFormation,
} from './prediction-risque.service';

/**
 * IA — Lecture des prédictions de risque (lecture seule, jamais de calcul ici).
 * Formateur : formations auxquelles il est affecté seulement (une autre
 * formation : 403 + audit ACCES_RESSOURCE_REFUSE, comme le reste de l'API) ;
 * administrateur : toutes ; apprenant : jamais (403).
 */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('formateur')
export class PredictionRisqueController {
  constructor(private readonly prediction: PredictionRisqueService) {}

  @Get('risque/formations')
  @ApiOperation({
    summary: 'Prédiction du risque : résumé par formation (IA)',
    description:
      'Une ligne par formation visible (formateur : ses formations ; administrateur : toutes) : ' +
      'inscrits, apprenants par niveau suggéré (élevé, moyen, faible), sans prédiction, ' +
      'alertes ouvertes des règles. Scores récents seulement.',
  })
  @ApiResponse({ status: 200, description: 'Résumé par formation.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant.' })
  resume(@Req() req: AuthenticatedRequest): Promise<ResumeRisqueFormation[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.prediction.resume(req.user);
  }

  @Get('formations/:formationId/risque')
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({
    summary: 'Prédiction du risque des apprenants d’une formation (IA)',
    description:
      'Pour chaque apprenant inscrit : niveau suggéré (FAIBLE, MOYEN, ELEVE), 3 raisons en ' +
      'français et alertes ouvertes des règles existantes. `disponible` = false si aucun ' +
      'score récent (service ml arrêté ou calcul pas encore fait). Suggestion du modèle, à ' +
      'valider par le formateur.',
  })
  @ApiResponse({ status: 200, description: 'Prédictions de la formation.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description: 'Apprenant, ou formateur non affecté (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  parFormation(
    @Param('formationId', ParseUUIDPipe) formationId: string,
  ): Promise<RisqueFormation> {
    return this.prediction.parFormation(formationId);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { LancerGenerationDto } from './generations.dto';
import { GenerationsService, GenerationVue } from './generations.service';

/**
 * Générations de questions par IA (US-IA-02, DS-06 partie 2, UC10 Formateur).
 * Formateur AFFECTÉ à la formation du module, ou administrateur. Le lancement
 * répond 202 ; l'état se lit sur la liste ou la fiche (SSE = US-IA-07).
 */
@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  @Post('modules/:moduleId/generations')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({
    summary: 'Lancer une génération de questions par IA (US-IA-02)',
    description:
      'À partir d’un support INDEXE du module : nombre (1–20), types (QCU, QCM, VRAI_FAUX), ' +
      'niveau, thème facultatif. Crée une génération EN_COURS et met le travail en file ' +
      '(pipeline RAG, US-IA-03). Une génération en cours au plus par formateur ; plafond horaire.',
  })
  @ApiResponse({ status: 202, description: 'Génération EN_COURS ; audit GENERATION_IA_LANCEE.' })
  @ApiResponse({ status: 400, description: 'Paramètres invalides.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable, ou support absent de ce module.' })
  @ApiResponse({
    status: 409,
    description:
      'Formation archivée ; support non indexé (aucun support indexé : invitation à en ' +
      'indexer un) ; génération déjà en cours pour ce formateur.',
  })
  @ApiResponse({ status: 429, description: 'Plafond horaire de générations atteint.' })
  lancer(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: LancerGenerationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GenerationVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.generationsService.lancer(req.user.sub, moduleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get('modules/:moduleId/generations')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Générations d’un module, plus récentes d’abord' })
  @ApiResponse({ status: 200, description: 'Liste (50 au plus).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  lister(@Param('moduleId', ParseUUIDPipe) moduleId: string): Promise<GenerationVue[]> {
    return this.generationsService.listerDuModule(moduleId);
  }

  @Get('generations/:generationId')
  @FormateurDeLaFormation({ generationId: 'generationId' })
  @ApiOperation({ summary: 'Fiche d’une génération (état, paramètres, compteurs)' })
  @ApiResponse({ status: 200, description: 'Fiche de la génération.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Génération introuvable.' })
  detail(@Param('generationId', ParseUUIDPipe) generationId: string): Promise<GenerationVue> {
    return this.generationsService.vue(generationId);
  }
}

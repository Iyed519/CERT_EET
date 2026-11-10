import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../database/enums/role.enum';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FiltreGenerationsDto } from './tracabilite.dto';
import {
  DetailGenerationTracee,
  PageGenerations,
  TracabiliteGenerationsService,
} from './tracabilite-generations.service';

/**
 * US-IA-05 — Traçabilité des générations IA, côté ADMINISTRATEUR. Lecture
 * seule : aucune route de modification.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/generations-ia')
export class TracabiliteGenerationsController {
  constructor(private readonly tracabilite: TracabiliteGenerationsService) {}

  @Get()
  @ApiOperation({ summary: 'Registre des générations IA (US-IA-05)' })
  @ApiResponse({
    status: 200,
    description:
      'Générations, les plus récentes d’abord : formateur, formation, module, support, modèle, paramètres, dates, statut, décisions.',
  })
  @ApiResponse({
    status: 400,
    description: 'Filtre invalide, période inversée, paramètre inconnu.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Réservé à l’administrateur.' })
  lister(@Query() filtre: FiltreGenerationsDto): Promise<PageGenerations> {
    return this.tracabilite.lister(filtre);
  }

  @Get(':generationId')
  @ApiOperation({
    summary: 'Détail d’une génération : suggestions, décisions, historique (US-IA-05)',
  })
  @ApiResponse({ status: 200, description: 'Génération, suggestions et historique d’audit.' })
  @ApiResponse({ status: 404, description: 'Génération introuvable.' })
  detail(
    @Param('generationId', ParseUUIDPipe) generationId: string,
  ): Promise<DetailGenerationTracee> {
    return this.tracabilite.detail(generationId);
  }
}

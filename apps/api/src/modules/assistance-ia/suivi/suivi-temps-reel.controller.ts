import { Controller, Param, ParseUUIDPipe, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Role } from '../../../database/enums/role.enum';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { EvenementSuivi, SuiviTempsReelService } from './suivi-temps-reel.service';

/**
 * US-IA-07 — Suivi en temps réel (SSE, ADR-06) de l'indexation d'un support et
 * d'une génération de questions, pour le formateur affecté (ou
 * l'administrateur). Repli : les routes REST `GET /supports/:id` et
 * `GET /generations/:id` donnent le même état.
 */
@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class SuiviTempsReelController {
  constructor(private readonly suivi: SuiviTempsReelService) {}

  @Sse('supports/:supportId/evenements')
  @FormateurDeLaFormation({ supportId: 'supportId' })
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Avancement de l’indexation d’un support, en direct (US-IA-07)' })
  @ApiResponse({
    status: 200,
    description: 'Flux SSE d’événements « etat », fermé à l’état final.',
  })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Support introuvable.' })
  support(@Param('supportId', ParseUUIDPipe) supportId: string): Observable<EvenementSuivi> {
    return this.suivi.flux('support', supportId);
  }

  @Sse('generations/:generationId/evenements')
  @FormateurDeLaFormation({ generationId: 'generationId' })
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Avancement d’une génération de questions, en direct (US-IA-07)' })
  @ApiResponse({
    status: 200,
    description: 'Flux SSE d’événements « etat », fermé à l’état final.',
  })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Génération introuvable.' })
  generation(
    @Param('generationId', ParseUUIDPipe) generationId: string,
  ): Observable<EvenementSuivi> {
    return this.suivi.flux('generation', generationId);
  }
}

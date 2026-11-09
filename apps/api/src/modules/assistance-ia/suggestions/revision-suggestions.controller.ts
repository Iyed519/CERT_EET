import {
  Body,
  Controller,
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
import { AccepterSuggestionDto, RejeterSuggestionDto } from './revision.dto';
import { AcceptationVue, RevisionSuggestionsService } from './revision-suggestions.service';
import { SuggestionVue } from './suggestion.vue';

/**
 * Révision humaine des suggestions de questions (US-IA-04, DS-06 P3, UC11
 * Formateur). Formateur AFFECTÉ à la formation, ou administrateur.
 */
@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('suggestions')
export class RevisionSuggestionsController {
  constructor(private readonly revisionService: RevisionSuggestionsService) {}

  @Post(':suggestionId/accepter')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ suggestionId: 'suggestionId' })
  @ApiOperation({
    summary: 'Accepter une suggestion, telle quelle ou modifiée (US-IA-04)',
    description:
      'Crée la question en fin du QCM choisi (même module que la génération), avec les règles ' +
      'de l’éditeur de QCM. Sans modification : ACCEPTEE, origine IA ; modifiée : MODIFIEE, ' +
      'origine IA_MODIFIEE.',
  })
  @ApiResponse({ status: 201, description: 'Suggestion décidée et question créée ; audit.' })
  @ApiResponse({ status: 400, description: 'Question non conforme ; QCM d’un autre module.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Suggestion ou QCM introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Suggestion déjà traitée ; formation archivée ; QCM déjà tenté (figé).',
  })
  accepter(
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @Body() dto: AccepterSuggestionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AcceptationVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.revisionService.accepter(req.user.sub, suggestionId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post(':suggestionId/rejeter')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ suggestionId: 'suggestionId' })
  @ApiOperation({ summary: 'Rejeter une suggestion, motif facultatif (US-IA-04)' })
  @ApiResponse({ status: 200, description: 'Suggestion REJETEE ; audit.' })
  @ApiResponse({ status: 400, description: 'Motif trop long.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Suggestion introuvable.' })
  @ApiResponse({ status: 409, description: 'Suggestion déjà traitée ; formation archivée.' })
  rejeter(
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @Body() dto: RejeterSuggestionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SuggestionVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.revisionService.rejeter(req.user.sub, suggestionId, dto, {
      adresseIp: req.ip ?? null,
    });
  }
}

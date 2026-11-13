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
import { NettoyageSupportInterceptor } from '../supports/depot-support';
import { ErreursDepotExtractionFilter, OPTIONS_DEPOT_EXTRACTION } from './depot-extraction';
import {
  AccepterQuestionExtraiteDto,
  RejeterQuestionExtraiteDto,
} from './extraction-questions.dto';
import {
  AcceptationExtraiteVue,
  ExtractionDetailVue,
  ExtractionQuestionsService,
  ExtractionVue,
  QuestionExtraiteVue,
  ToutAccepterVue,
} from './extraction-questions.service';

const R401 = { status: 401, description: 'Non authentifié.' };
const R403 = { status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' };

/**
 * US-IA-08 — Extraction des questions d'un document par l'IA. Formateur
 * AFFECTÉ à la formation du QCM, ou administrateur.
 */
@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class ExtractionQuestionsController {
  constructor(private readonly service: ExtractionQuestionsService) {}

  private acteur(req: AuthenticatedRequest): string {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return req.user.sub;
  }

  @Post('qcm/:qcmId/extractions')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @UseFilters(ErreursDepotExtractionFilter)
  @UseInterceptors(
    NettoyageSupportInterceptor,
    FileInterceptor('fichier', OPTIONS_DEPOT_EXTRACTION),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichier'],
      properties: {
        fichier: {
          type: 'string',
          format: 'binary',
          description: 'PDF (texte ou scanné), DOCX, TXT, MD, CSV, XLSX, PNG, JPEG, WEBP ; 10 Mo.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Importer des questions depuis un fichier (US-IA-08)',
    description:
      'L’IA recopie les questions présentes dans le document (sans en inventer ; bonne réponse ' +
      'à choisir si le document ne la donne pas). Traitement en tâche de fond : EN_ATTENTE, ' +
      'EN_COURS, TERMINEE ou ECHEC. Rien n’est ajouté au QCM sans acceptation.',
  })
  @ApiResponse({
    status: 202,
    description: 'Extraction EN_ATTENTE ; audit QUESTIONS_EXTRACTION_LANCEE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Fichier absent, vide, trop lourd, format non pris en charge, contenu non conforme à l’extension.',
  })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée ; QCM déjà tenté (figé) ; extraction déjà en cours pour vous.',
  })
  @ApiResponse({ status: 429, description: 'Plafond horaire d’extractions atteint.' })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  lancer(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExtractionVue> {
    return this.service.lancer(this.acteur(req), qcmId, fichier ?? null, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get('qcm/:qcmId/extractions')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Extractions d’un QCM, plus récentes d’abord (20 au plus)' })
  @ApiResponse({ status: 200, description: 'Liste.' })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  lister(@Param('qcmId', ParseUUIDPipe) qcmId: string): Promise<ExtractionVue[]> {
    return this.service.listerDuQcm(qcmId);
  }

  @Get('extractions/:extractionId')
  @FormateurDeLaFormation({ extractionId: 'extractionId' })
  @ApiOperation({
    summary: 'Une extraction : état et questions extraites, dans l’ordre du document',
  })
  @ApiResponse({ status: 200, description: 'Fiche et questions.' })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'Extraction introuvable.' })
  detail(@Param('extractionId', ParseUUIDPipe) extractionId: string): Promise<ExtractionDetailVue> {
    return this.service.detail(extractionId);
  }

  @Post('extractions/:extractionId/relancer')
  @HttpCode(HttpStatus.ACCEPTED)
  @FormateurDeLaFormation({ extractionId: 'extractionId' })
  @ApiOperation({ summary: 'Relancer une extraction en échec (fichier conservé)' })
  @ApiResponse({
    status: 202,
    description: 'Extraction EN_ATTENTE ; audit QUESTIONS_EXTRACTION_RELANCEE.',
  })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'Extraction introuvable.' })
  @ApiResponse({
    status: 409,
    description:
      'Extraction non en échec ; fichier plus conservé ; QCM figé ; extraction déjà en cours.',
  })
  relancer(
    @Param('extractionId', ParseUUIDPipe) extractionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExtractionVue> {
    return this.service.relancer(this.acteur(req), extractionId, { adresseIp: req.ip ?? null });
  }

  @Post('extractions/:extractionId/tout-accepter')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ extractionId: 'extractionId' })
  @ApiOperation({
    summary: 'Accepter telles quelles toutes les questions complètes encore à traiter',
    description:
      'Les questions dont la bonne réponse est à choisir ne sont jamais acceptées ainsi.',
  })
  @ApiResponse({
    status: 200,
    description: 'Nombre d’acceptées, d’ignorées, et l’extraction à jour.',
  })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'Extraction introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée ; QCM déjà tenté (figé).' })
  toutAccepter(
    @Param('extractionId', ParseUUIDPipe) extractionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ToutAccepterVue> {
    return this.service.toutAccepter(this.acteur(req), extractionId, { adresseIp: req.ip ?? null });
  }

  @Post('questions-extraites/:questionExtraiteId/accepter')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ questionExtraiteId: 'questionExtraiteId' })
  @ApiOperation({
    summary: 'Accepter une question extraite, telle quelle ou retouchée',
    description:
      'Ajoute la question en fin de QCM avec les règles de l’éditeur. Bonne réponse absente du ' +
      'document : la version retouchée (avec au moins une bonne réponse) est obligatoire.',
  })
  @ApiResponse({ status: 201, description: 'Question ajoutée ; audit QUESTION_EXTRAITE_ACCEPTEE.' })
  @ApiResponse({ status: 400, description: 'Bonne réponse à choisir ; question non conforme.' })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'Question extraite introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà traitée ; formation archivée ; QCM déjà tenté.' })
  accepter(
    @Param('questionExtraiteId', ParseUUIDPipe) questionExtraiteId: string,
    @Body() dto: AccepterQuestionExtraiteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AcceptationExtraiteVue> {
    return this.service.accepter(this.acteur(req), questionExtraiteId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('questions-extraites/:questionExtraiteId/rejeter')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ questionExtraiteId: 'questionExtraiteId' })
  @ApiOperation({ summary: 'Rejeter une question extraite, motif facultatif' })
  @ApiResponse({ status: 200, description: 'Question REJETEE ; audit QUESTION_EXTRAITE_REJETEE.' })
  @ApiResponse({ status: 400, description: 'Motif trop long.' })
  @ApiResponse(R401)
  @ApiResponse(R403)
  @ApiResponse({ status: 404, description: 'Question extraite introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà traitée ; formation archivée.' })
  rejeter(
    @Param('questionExtraiteId', ParseUUIDPipe) questionExtraiteId: string,
    @Body() dto: RejeterQuestionExtraiteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QuestionExtraiteVue> {
    return this.service.rejeter(this.acteur(req), questionExtraiteId, dto, {
      adresseIp: req.ip ?? null,
    });
  }
}

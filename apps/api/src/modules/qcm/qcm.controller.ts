import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { ImportBanqueDto, RechercheBanqueDto } from './dto/banque.dto';
import { ConfigurationDto } from './dto/configuration.dto';
import { CreateQcmDto } from './dto/create-qcm.dto';
import { QuestionDto } from './dto/question.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { UpdateQcmDto } from './dto/update-qcm.dto';
import { ConfigurationVue, QcmConfigurationService } from './qcm-configuration.service';
import { QcmPublicationService } from './qcm-publication.service';
import { BanqueVue, QcmDetailVue, QcmResumeVue, QcmService, QuestionVue } from './qcm.service';

const REFUS_403 =
  'Rôle insuffisant, ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).';

/**
 * Contenu des QCM, paramètres anti-fraude et publication — côté FORMATEUR
 * affecté et ADMINISTRATEUR (US-QCM-01, US-QCM-03, US-QCM-04, DS-12).
 * Première série de routes qui posent @FormateurDeLaFormation sur un module
 * ou un QCM (US-AUTH-16) : le garde remonte à la formation et vérifie
 * l'affectation avant que la requête n'atteigne le service.
 *
 * `PUT /qcm/:qcmId/questions/ordre` est déclaré AVANT
 * `PUT /qcm/:qcmId/questions/:questionId` : sinon « ordre » serait pris pour
 * un identifiant de question.
 */
@ApiBearerAuth('access-token')
@ApiTags('qcm')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class QcmController {
  constructor(
    private readonly qcmService: QcmService,
    private readonly configurationService: QcmConfigurationService,
    private readonly publicationService: QcmPublicationService,
  ) {}

  @Post('modules/:moduleId/qcm')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Créer un QCM (brouillon) dans un module (US-QCM-01)' })
  @ApiResponse({ status: 201, description: 'QCM créé au statut BROUILLON ; audit QCM_CREE.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé ou titre invalide.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  creer(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateQcmDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QcmResumeVue> {
    return this.qcmService.creer(this.acteur(req).sub, moduleId, dto, this.contexte(req));
  }

  @Get('modules/:moduleId/qcm')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Lister les QCM d’un module, tous statuts (US-QCM-01)' })
  @ApiResponse({ status: 200, description: 'QCM du module avec leur nombre de questions.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  lister(@Param('moduleId', ParseUUIDPipe) moduleId: string): Promise<QcmResumeVue[]> {
    return this.qcmService.listerDuModule(moduleId);
  }

  @Get('qcm/:qcmId')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Consulter un QCM, ses questions et les bonnes réponses (US-QCM-01)' })
  @ApiResponse({ status: 200, description: 'QCM, questions triées, options avec estCorrecte.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  detail(@Param('qcmId', ParseUUIDPipe) qcmId: string): Promise<QcmDetailVue> {
    return this.qcmService.detail(qcmId);
  }

  @Patch('qcm/:qcmId')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Modifier le titre ou la description d’un QCM (US-QCM-01)' })
  @ApiResponse({ status: 200, description: 'QCM modifié ; audit QCM_MODIFIE.' })
  @ApiResponse({ status: 400, description: 'Corps vide ou titre vide.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  modifier(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: UpdateQcmDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QcmDetailVue> {
    return this.qcmService.modifier(this.acteur(req).sub, qcmId, dto, this.contexte(req));
  }

  @Delete('qcm/:qcmId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Supprimer un QCM non publié et sans tentative (US-QCM-01)' })
  @ApiResponse({ status: 204, description: 'QCM supprimé ; audit QCM_SUPPRIME.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({ status: 409, description: 'QCM publié, avec tentatives, ou formation archivée.' })
  async supprimer(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.qcmService.supprimer(this.acteur(req).sub, qcmId, this.contexte(req));
  }

  @Put('qcm/:qcmId/configuration')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({
    summary: 'Enregistrer les paramètres anti-fraude d’un QCM (US-QCM-03)',
    description:
      'Crée ou remplace la configuration : randomisation (questions, options, tirage de K parmi N), ' +
      'durée et fenêtre d’ouverture, tentatives et délai, blocage multi-session, affichage du résultat, ' +
      'seuil de réussite, poids dans la formation, surveillance webcam par captures (US-QCM-12, ' +
      'désactivée par défaut) et copier-coller (enregistré, pas encore appliqué). Le QCM passe de ' +
      'BROUILLON à NON_PUBLIE ; un QCM publié le reste. Dès la première ' +
      'tentative, seule la date de fermeture peut être repoussée.',
  })
  @ApiResponse({ status: 200, description: 'Configuration enregistrée ; audit QCM_CONFIGURE.' })
  @ApiResponse({
    status: 400,
    description:
      'Champ invalide, ouverture ≥ fermeture, fermeture passée, fenêtre plus courte que la durée, ' +
      'ou tirage supérieur au nombre de questions.',
  })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({
    status: 409,
    description:
      'QCM sans question, QCM déjà tenté (seule la fermeture peut être repoussée), ou formation archivée.',
  })
  configurer(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: ConfigurationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConfigurationVue> {
    return this.configurationService.configurer(
      this.acteur(req).sub,
      qcmId,
      dto,
      this.contexte(req),
    );
  }

  @Patch('qcm/:qcmId/publier')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({
    summary: 'Publier un QCM (US-QCM-04)',
    description:
      'Rend le QCM visible aux apprenants inscrits, avec sa fenêtre d’ouverture. Exige au moins une ' +
      'question, une configuration anti-fraude, un tirage ne dépassant pas le nombre de questions et ' +
      'une date de fermeture encore à venir. Le démarrage d’une tentative reste contrôlé par le serveur.',
  })
  @ApiResponse({ status: 200, description: 'QCM publié (détail renvoyé) ; audit QCM_PUBLIE.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({
    status: 409,
    description:
      '« QCM incomplet pour publication » (sans question, sans configuration, tirage trop grand), ' +
      'fenêtre close, QCM déjà publié, ou formation archivée.',
  })
  publier(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<QcmDetailVue> {
    return this.publicationService.publier(this.acteur(req).sub, qcmId, this.contexte(req));
  }

  @Post('qcm/:qcmId/questions')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Ajouter une question et ses options (US-QCM-01)' })
  @ApiResponse({
    status: 201,
    description: 'Question ajoutée en fin de QCM ; audit QUESTION_AJOUTEE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Règle non respectée (≥ 2 options, ≥ 1 bonne réponse, QCU → 1, Vrai/Faux → 2 options et 1 bonne réponse, type non pris en charge…).',
  })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({ status: 409, description: 'QCM verrouillé (tentatives) ou formation archivée.' })
  ajouterQuestion(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: QuestionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QuestionVue> {
    return this.qcmService.ajouterQuestion(this.acteur(req).sub, qcmId, dto, this.contexte(req));
  }

  @Put('qcm/:qcmId/questions/ordre')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Réordonner toutes les questions du QCM (US-QCM-01)' })
  @ApiResponse({ status: 200, description: 'QCM avec ses questions dans le nouvel ordre.' })
  @ApiResponse({ status: 400, description: 'Liste incomplète, avec doublon ou intrus.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 409, description: 'QCM verrouillé ou formation archivée.' })
  reordonner(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: ReorderQuestionsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QcmDetailVue> {
    return this.qcmService.reordonnerQuestions(
      this.acteur(req).sub,
      qcmId,
      dto.questionIds,
      this.contexte(req),
    );
  }

  @Put('qcm/:qcmId/questions/:questionId')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Remplacer une question (US-QCM-01)' })
  @ApiResponse({ status: 200, description: 'Question remplacée ; audit QUESTION_MODIFIEE.' })
  @ApiResponse({ status: 400, description: 'Règle de validation non respectée.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable, ou question absente de ce QCM.' })
  @ApiResponse({
    status: 409,
    description: 'QCM verrouillé (seule l’explication peut changer) ou formation archivée.',
  })
  remplacerQuestion(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: QuestionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QuestionVue> {
    return this.qcmService.remplacerQuestion(
      this.acteur(req).sub,
      qcmId,
      questionId,
      dto,
      this.contexte(req),
    );
  }

  @Delete('qcm/:qcmId/questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Retirer une question du QCM (US-QCM-01)' })
  @ApiResponse({ status: 204, description: 'Question retirée ; audit QUESTION_SUPPRIMEE.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable, ou question absente de ce QCM.' })
  @ApiResponse({
    status: 409,
    description:
      'QCM verrouillé, formation archivée, ou QCM publié qui garderait moins d’une question ' +
      '(ou moins que son tirage).',
  })
  async supprimerQuestion(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.qcmService.supprimerQuestion(
      this.acteur(req).sub,
      qcmId,
      questionId,
      this.contexte(req),
    );
  }

  @Get('qcm/:qcmId/banque')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Ma banque de questions, hors celles du QCM (US-QCM-02)' })
  @ApiResponse({
    status: 200,
    description:
      'Questions de mes QCM (énoncé, options, QCM qui les utilisent, figée ou non) ; message si aucune ne correspond.',
  })
  @ApiResponse({ status: 400, description: 'Recherche trop longue, paramètre inconnu.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  banque(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Query() requete: RechercheBanqueDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BanqueVue> {
    return this.qcmService.banque(this.acteur(req).sub, qcmId, requete.recherche);
  }

  @Post('qcm/:qcmId/banque/import')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Lier des questions de ma banque au QCM, sans copie (US-QCM-02)' })
  @ApiResponse({
    status: 200,
    description: 'QCM avec les questions liées en fin ; audit QUESTIONS_IMPORTEES.',
  })
  @ApiResponse({
    status: 400,
    description: 'Liste vide ou trop longue, question hors de ma banque ou déjà dans ce QCM.',
  })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  @ApiResponse({ status: 409, description: 'QCM verrouillé (tentatives) ou formation archivée.' })
  importerDeLaBanque(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: ImportBanqueDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<QcmDetailVue> {
    return this.qcmService.importerDeLaBanque(
      this.acteur(req).sub,
      qcmId,
      dto.questionIds,
      this.contexte(req),
    );
  }

  private acteur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }

  private contexte(req: AuthenticatedRequest): { adresseIp: string | null } {
    return { adresseIp: req.ip ?? null };
  }
}

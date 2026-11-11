import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  TentativeConsultationService,
  TentativeConsulteeVue,
} from './tentative-consultation.service';
import { CorrectionVue, TentativeCorrectionService } from './tentative-correction.service';
import { TentativeDemarrageService, TentativeDemarreeVue } from './tentative-demarrage.service';
import {
  ContextePassage,
  ReponseEnregistreeVue,
  TentativePassageService,
  TentativeSoumiseVue,
} from './tentative-passage.service';
import { sessionDe } from './tentative-session.regles';
import { DemarrerTentativeDto } from './dto/demarrer-tentative.dto';
import { EnregistrerReponseDto } from './dto/enregistrer-reponse.dto';

/** Texte Swagger commun aux quatre routes protégées par US-QCM-10. */
const REFUS_SESSION =
  '`raison: session_active_ailleurs` : blocage des sessions multiples actif et tentative ' +
  'EN_COURS détenue par une autre session encore ouverte (autre appareil) ; audit ' +
  'SESSION_MULTIPLE_REFUSEE (US-QCM-10). Le verrou tombe à la déconnexion de cette session ' +
  'ou à l’échéance de la tentative.';

/**
 * Passage des QCM — côté APPRENANT (US-QCM-05 : démarrer, consulter ;
 * US-QCM-06 : questions tirées ; US-QCM-07 : enregistrer une réponse,
 * soumettre ; US-QCM-08 : notation à chaque clôture, score et réussite ;
 * US-QCM-09 : corrigé selon le mode d'affichage).
 *
 * Contrôleur à part de QcmController, dont le @Roles de classe est réservé
 * aux formateurs et administrateurs. Ici, seul un apprenant passe un QCM, et
 * l'apprenant est TOUJOURS celui du jeton.
 *
 * Route `POST /qcm/:qcmId/tentatives` (Sprint 2 Backlog) plutôt que le
 * `GET /qcm/:qcmId/acces` de DS-02 / DS-09 : la requête crée une ressource, et
 * un GET ne doit pas avoir d'effet de bord (décision D1). De même,
 * `PUT /tentatives/:tentativeId/reponses/:questionId` et
 * `POST /tentatives/:tentativeId/soumettre` plutôt que les routes
 * `/qcm/tentative/…` de DS-02 : une seule famille de routes pour la
 * tentative (US-QCM-07, D3). Le corrigé a sa propre route,
 * `GET /tentatives/:tentativeId/correction`, plutôt que le `detailParQuestion`
 * de la réponse de soumission (DS-02 étape 5) : ni la consultation ni la
 * soumission ne portent de bonne réponse (US-QCM-09, D1).
 *
 * US-QCM-10 : la session de la requête (claim `sid`) est transmise aux
 * services ; démarrage-reprise, consultation, réponse et soumission refusent
 * (409) une tentative EN_COURS détenue par une autre session ouverte.
 */
@ApiBearerAuth('access-token')
@ApiTags('tentatives')
@Roles(Role.APPRENANT)
@Controller()
export class TentativesController {
  constructor(
    private readonly demarrageService: TentativeDemarrageService,
    private readonly consultationService: TentativeConsultationService,
    private readonly passageService: TentativePassageService,
    private readonly correctionService: TentativeCorrectionService,
  ) {}

  @Post('qcm/:qcmId/tentatives')
  @ApiOperation({
    summary: 'Démarrer (ou reprendre) une tentative de QCM (US-QCM-05)',
    description:
      'Contrôles serveur : QCM publié, inscription EN_COURS, fenêtre [ouverture, fermeture), ' +
      'nombre de tentatives, délai depuis la précédente. Une tentative EN_COURS encore valide est ' +
      'reprise (200) au lieu d’en créer une seconde ; une tentative dont l’échéance est dépassée est ' +
      'clôturée (ABANDONNEE_TIMER). Échéance = min(début + durée, fermeture). Les questions ' +
      'arrivent avec US-QCM-06.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tentative créée (EN_COURS, reprise = false) ; audit TENTATIVE_DEMARREE.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tentative EN_COURS existante reprise (reprise = true) ; pas de nouvel audit.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Rôle autre qu’apprenant, pas inscrit à la formation, inscription suspendue ou terminée ' +
      '(audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({ status: 404, description: 'QCM introuvable ou non publié.' })
  @ApiResponse({
    status: 409,
    description:
      'Démarrage refusé, avec `message`, `raison` (hors_fenetre | tentatives_epuisees | ' +
      'delai_non_respecte) et `dateReouverture` quand elle existe ; audit TENTATIVE_DEMARREE (Échec). ' +
      'Ou reprise refusée : ' +
      REFUS_SESSION,
  })
  async demarrer(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: DemarrerTentativeDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TentativeDemarreeVue> {
    const apprenant = this.exigerUtilisateur(req);
    const vue = await this.demarrageService.demarrer(apprenant.sub, qcmId, sessionDe(apprenant), {
      adresseIp: req.ip ?? null,
      methode: req.method,
      route: req.originalUrl,
    }, { consentementSurveillance: dto?.consentementSurveillance });
    res.status(vue.reprise ? HttpStatus.OK : HttpStatus.CREATED);
    return vue;
  }

  @Get('tentatives/:tentativeId')
  @ApiOperation({
    summary: 'Consulter une de mes tentatives et ses questions (US-QCM-05, US-QCM-06)',
    description:
      'Statut, échéance, rang et heure du serveur (`maintenant`), pour un compte à rebours qui ne ' +
      'dépend pas de l’horloge du navigateur. Pendant le temps de passage, les questions dans l’ordre ' +
      'du tirage figé à la création, chacune avec ses options dans l’ordre tiré : `id`, `enonce`, ' +
      '`type`, options `{ id, texte }` — jamais la bonne réponse, l’explication ni la pondération. ' +
      'Une tentative créée avant le tirage reçoit le sien une seule fois, à la première lecture. ' +
      '`reponses` : mes réponses déjà enregistrées, par question (US-QCM-07), pour restaurer la ' +
      'page. Aucune clôture ici : la lecture reste sans effet. `correction` (US-QCM-09) : ' +
      '`{ mode, disponible, raison, disponibleLe }`, sans aucune réponse.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Ma tentative ; `questions` et `reponses` vides hors du temps de passage ; `score` et ' +
      '`estReussie` renseignés une fois NOTEE (US-QCM-08) ; état du corrigé (US-QCM-09).',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Tentative inconnue, ou tentative d’un autre apprenant (non révélée).',
  })
  @ApiResponse({ status: 409, description: `Pendant le temps de passage : ${REFUS_SESSION}` })
  consulter(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TentativeConsulteeVue> {
    const apprenant = this.exigerUtilisateur(req);
    return this.consultationService.consulter(apprenant.sub, tentativeId, {
      sessionId: sessionDe(apprenant),
      adresseIp: req.ip ?? null,
      route: req.originalUrl,
    });
  }

  @Get('tentatives/:tentativeId/correction')
  @ApiOperation({
    summary: 'Consulter le corrigé d’une de mes tentatives notées (US-QCM-09)',
    description:
      'Score, seuil, puis chaque question dans l’ordre du tirage : énoncé, pondération, ma ' +
      'réponse (`cochee`), juste / faux et points tels que la notation les a écrits, bonnes ' +
      'options (`estCorrecte`) et explication. Disponible seulement si la tentative est NOTEE et : ' +
      'fenêtre du QCM fermée (heure de la base) ; ou, en affichage IMMÉDIAT, plus aucune ' +
      'tentative possible (quota atteint, aucune EN_COURS). En affichage DIFFÉRÉ, jamais avant ' +
      'la fermeture. Lecture seule, sans audit.',
  })
  @ApiResponse({ status: 200, description: 'Corrigé de la tentative.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Tentative inconnue, ou tentative d’un autre apprenant (non révélée).',
  })
  @ApiResponse({
    status: 409,
    description:
      'Corrigé indisponible, avec `message`, `raison` (non_notee | correction_differee | ' +
      'tentatives_restantes) et `disponibleLe` (fermeture du QCM, null pour non_notee).',
  })
  corriger(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CorrectionVue> {
    return this.correctionService.corriger(this.exigerUtilisateur(req).sub, tentativeId);
  }

  @Put('tentatives/:tentativeId/reponses/:questionId')
  @ApiOperation({
    summary: 'Enregistrer ma réponse à une question (US-QCM-07)',
    description:
      'Remplace la réponse entière à UNE question : renvoyer le même corps donne le même ' +
      'résultat ; `optionIds: []` efface la réponse. Contrôles serveur, sous verrou de la ' +
      'tentative : elle est à moi, EN_COURS, son échéance n’est pas atteinte (horloge de la ' +
      'base) ; la question fait partie de MON tirage ; les options appartiennent à la question ; ' +
      'une seule option pour un QCU ou un Vrai/Faux. Échéance atteinte : la tentative est ' +
      'clôturée (ABANDONNEE_TIMER, réponses conservées, audit TENTATIVE_EXPIREE).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Réponse enregistrée : `questionId`, `optionIds` (ordre du tirage), `enregistreeLe` ' +
      '(null si effacée), `maintenant`, `dateLimite`.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Identifiant ou corps invalide, ou refus avec `raison` : question_hors_tirage | ' +
      'option_hors_question | une_seule_option | type_non_pris_en_charge.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Tentative inconnue, ou tentative d’un autre apprenant (non révélée).',
  })
  @ApiResponse({
    status: 409,
    description:
      'Tentative terminée (`raison: tentative_terminee`, `statut`) ou temps écoulé ' +
      '(`raison: temps_ecoule`, `dateLimite`) : la tentative vient d’être clôturée. Ou ' +
      REFUS_SESSION,
  })
  enregistrerReponse(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: EnregistrerReponseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReponseEnregistreeVue> {
    const apprenant = this.exigerUtilisateur(req);
    return this.passageService.enregistrerReponse(
      apprenant.sub,
      tentativeId,
      questionId,
      dto.optionIds,
      this.contextePassage(req, apprenant),
    );
  }

  @Post('tentatives/:tentativeId/soumettre')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soumettre ma tentative (US-QCM-07)',
    description:
      'Soumission confirmée par l’apprenant (DS-02 étape 4) : mêmes contrôles que ' +
      'l’enregistrement, puis statut SOUMISE, `dateFin` et `dureeEffective` à l’heure de la base, ' +
      'audit QCM_SOUMIS, minuterie Redis supprimée ; puis notation serveur (US-QCM-08) : ' +
      'tentative NOTEE et figée, `score` pondéré sur les questions du tirage, `estReussie` ' +
      'selon le seuil du QCM, audit TENTATIVE_NOTEE.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tentative soumise et notée : `statut` NOTEE, `score`, `estReussie`, `dateFin`, ' +
      '`dureeEffective` (s), `nbQuestions`, `nbReponses`. Si la notation a échoué : SOUMISE, ' +
      '`score` et `estReussie` nuls (le balayage la notera).',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Tentative inconnue, ou tentative d’un autre apprenant (non révélée).',
  })
  @ApiResponse({
    status: 409,
    description:
      'Déjà terminée (`raison: tentative_terminee`) ou temps écoulé (`raison: temps_ecoule`, ' +
      'la tentative est clôturée ABANDONNEE_TIMER). Ou ' +
      REFUS_SESSION,
  })
  soumettre(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TentativeSoumiseVue> {
    const apprenant = this.exigerUtilisateur(req);
    return this.passageService.soumettre(
      apprenant.sub,
      tentativeId,
      this.contextePassage(req, apprenant),
    );
  }

  private contextePassage(
    req: AuthenticatedRequest,
    apprenant: AccessTokenPayload,
  ): ContextePassage {
    return {
      adresseIp: req.ip ?? null,
      sessionId: sessionDe(apprenant),
      route: req.originalUrl,
    };
  }

  private exigerUtilisateur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }
}

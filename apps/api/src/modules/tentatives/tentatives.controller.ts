import {
  Controller,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { TentativeDemarrageService, TentativeDemarreeVue } from './tentative-demarrage.service';

/**
 * Passage des QCM — côté APPRENANT (US-QCM-05 ; US-QCM-06 à 08 suivront).
 *
 * Contrôleur à part de QcmController, dont le @Roles de classe est réservé
 * aux formateurs et administrateurs. Ici, seul un apprenant passe un QCM, et
 * l'apprenant est TOUJOURS celui du jeton.
 *
 * Route `POST /qcm/:qcmId/tentatives` (Sprint 2 Backlog) plutôt que le
 * `GET /qcm/:qcmId/acces` de DS-02 / DS-09 : la requête crée une ressource, et
 * un GET ne doit pas avoir d'effet de bord (décision D1).
 */
@ApiBearerAuth('access-token')
@ApiTags('tentatives')
@Roles(Role.APPRENANT)
@Controller()
export class TentativesController {
  constructor(private readonly demarrageService: TentativeDemarrageService) {}

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
      'delai_non_respecte) et `dateReouverture` quand elle existe ; audit TENTATIVE_DEMARREE (Échec).',
  })
  async demarrer(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TentativeDemarreeVue> {
    const apprenant = this.exigerUtilisateur(req);
    const vue = await this.demarrageService.demarrer(apprenant.sub, qcmId, {
      adresseIp: req.ip ?? null,
      methode: req.method,
      route: req.originalUrl,
    });
    res.status(vue.reprise ? HttpStatus.OK : HttpStatus.CREATED);
    return vue;
  }

  private exigerUtilisateur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }
}

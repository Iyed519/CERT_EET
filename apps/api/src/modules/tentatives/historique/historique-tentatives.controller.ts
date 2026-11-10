import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { FiltreMesTentativesDto, FiltreTentativesQcmDto } from './historique.dto';
import {
  DetailHistoriqueApprenant,
  DetailHistoriqueFormateur,
  HistoriqueTentativesService,
  LigneHistorique,
  LigneHistoriqueFormateur,
} from './historique-tentatives.service';

const identifiant = (req: AuthenticatedRequest): string => {
  if (!req.user) throw new UnauthorizedException('Non authentifié.');
  return req.user.sub;
};

/**
 * US-QCM-11 — Historique des tentatives, côté apprenant : les siennes
 * seulement. Lecture seule : aucune route de modification n'existe.
 */
@ApiBearerAuth('access-token')
@ApiTags('tentatives')
@Roles(Role.APPRENANT)
@Controller()
export class HistoriqueApprenantController {
  constructor(private readonly historique: HistoriqueTentativesService) {}

  @Get('mes-tentatives')
  @ApiOperation({ summary: 'Mon historique de tentatives (US-QCM-11)' })
  @ApiResponse({
    status: 200,
    description:
      'Mes tentatives, les plus récentes d’abord : rang, statut, dates, durée, score (une fois notée).',
  })
  @ApiResponse({ status: 400, description: 'qcmId invalide, paramètre inconnu.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Réservé aux apprenants.' })
  mesTentatives(
    @Query() filtre: FiltreMesTentativesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LigneHistorique[]> {
    return this.historique.mesTentatives(identifiant(req), filtre.qcmId);
  }

  @Get('mes-tentatives/:tentativeId')
  @ApiOperation({ summary: 'Détail d’une de mes tentatives (US-QCM-11)' })
  @ApiResponse({
    status: 200,
    description:
      'Questions vues et options cochées, sans bonne réponse ; état du corrigé (US-QCM-09).',
  })
  @ApiResponse({ status: 404, description: 'Tentative inconnue ou d’un autre apprenant.' })
  monDetail(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DetailHistoriqueApprenant> {
    return this.historique.monDetail(identifiant(req), tentativeId);
  }
}

/**
 * US-QCM-11 — Historique des tentatives d'un QCM, côté formateur affecté
 * (ou administrateur). Lecture seule.
 */
@ApiBearerAuth('access-token')
@ApiTags('formateur')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('formateur/qcm/:qcmId/tentatives')
export class HistoriqueFormateurController {
  constructor(private readonly historique: HistoriqueTentativesService) {}

  @Get()
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Tentatives de mon QCM (US-QCM-11)' })
  @ApiResponse({
    status: 200,
    description: 'Tentatives, les plus récentes d’abord, avec l’apprenant.',
  })
  @ApiResponse({ status: 400, description: 'apprenantId invalide, paramètre inconnu.' })
  @ApiResponse({ status: 403, description: 'Apprenant, ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'QCM introuvable.' })
  tentatives(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Query() filtre: FiltreTentativesQcmDto,
  ): Promise<LigneHistoriqueFormateur[]> {
    return this.historique.tentativesDuQcm(qcmId, filtre.apprenantId);
  }

  @Get(':tentativeId')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiOperation({ summary: 'Détail d’une tentative, corrigé compris (US-QCM-11)' })
  @ApiResponse({
    status: 200,
    description: 'Par question : options cochées, bonnes réponses, juste / faux, points.',
  })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Tentative inconnue ou d’un autre QCM.' })
  detail(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
  ): Promise<DetailHistoriqueFormateur> {
    return this.historique.detailFormateur(qcmId, tentativeId);
  }
}

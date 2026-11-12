import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { DemandeurRapport, RapportPdf, RapportTentativeService } from './rapport-tentative.service';

const demandeur = (req: AuthenticatedRequest): DemandeurRapport => {
  if (!req.user) throw new UnauthorizedException('Non authentifié.');
  return { id: req.user.sub, role: req.user.role, adresseIp: req.ip ?? null };
};

/** Pièce jointe PDF, jamais mise en cache (document personnel). */
const fichier = (rapport: RapportPdf, res: Response): StreamableFile => {
  res.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(rapport.pdf, {
    type: 'application/pdf',
    length: rapport.pdf.length,
    disposition: `attachment; filename="${rapport.nomFichier}"`,
  });
};

const DESCRIPTION =
  'En-tête (formation, module, QCM, apprenant, rang, dates, durée, clôture), synthèse (score ' +
  'sur 100, seuil, verdict, justes / fausses / sans réponse, points) et détail par question ' +
  'dans l’ordre du tirage : réponse cochée, juste / faux, points ; bonnes réponses et ' +
  'explications seulement si le corrigé est inclus. Lecture seule de la tentative figée (aucun ' +
  'recalcul), générée à la demande ; `Content-Disposition: attachment`, ' +
  '`Cache-Control: no-store` ; audit RAPPORT_QCM_TELECHARGE (acteur, apprenant en cible).';

/**
 * US-QCM-13 — Rapport PDF d'une de MES tentatives notées (apprenant). Le
 * corrigé n'y figure que si la règle d'US-QCM-09 le rend disponible.
 */
@ApiBearerAuth('access-token')
@ApiTags('tentatives')
@Roles(Role.APPRENANT)
@Controller('tentatives/:tentativeId')
export class RapportApprenantController {
  constructor(private readonly rapports: RapportTentativeService) {}

  @Get('rapport.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Télécharger le rapport PDF d’une de mes tentatives notées (US-QCM-13)',
    description:
      `${DESCRIPTION} Corrigé inclus exactement quand \`GET /tentatives/:id/correction\` ` +
      'le sert ; sinon, ni bonne réponse ni explication, et la date de disponibilité.',
  })
  @ApiResponse({ status: 200, description: 'Le rapport (application/pdf, en pièce jointe).' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’apprenant.' })
  @ApiResponse({
    status: 404,
    description: 'Tentative inconnue, ou tentative d’un autre apprenant (non révélée).',
  })
  @ApiResponse({
    status: 409,
    description: 'Tentative pas encore notée (`raison: tentative_non_notee`) ; aucun PDF.',
  })
  async rapport(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return fichier(await this.rapports.pourApprenant(demandeur(req), tentativeId), res);
  }
}

/**
 * US-QCM-13 — Rapport PDF d'une tentative de mon QCM (formateur affecté) ou
 * de tout QCM (administrateur), corrigé toujours inclus. Même préfixe que
 * l'historique côté formateur (US-QCM-11) : le garde de formation s'appuie
 * sur `qcmId`.
 */
@ApiBearerAuth('access-token')
@ApiTags('formateur')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('formateur/qcm/:qcmId/tentatives/:tentativeId')
export class RapportFormateurController {
  constructor(private readonly rapports: RapportTentativeService) {}

  @Get('rapport.pdf')
  @FormateurDeLaFormation({ qcmId: 'qcmId' })
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Télécharger le rapport PDF d’une tentative d’un apprenant (US-QCM-13)',
    description: `${DESCRIPTION} Corrigé toujours inclus, quel que soit le mode d’affichage.`,
  })
  @ApiResponse({ status: 200, description: 'Le rapport (application/pdf, en pièce jointe).' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Apprenant, ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).',
  })
  @ApiResponse({
    status: 404,
    description: 'QCM inconnu, ou tentative inconnue ou d’un autre QCM.',
  })
  @ApiResponse({
    status: 409,
    description: 'Tentative pas encore notée (`raison: tentative_non_notee`) ; aucun PDF.',
  })
  async rapport(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return fichier(await this.rapports.pourFormateur(demandeur(req), qcmId, tentativeId), res);
  }
}

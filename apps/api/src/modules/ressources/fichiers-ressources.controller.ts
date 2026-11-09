import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  FichiersRessourcesService,
  LienLecture,
  PlageInsatisfaisable,
} from './fichiers-ressources.service';

/**
 * Lecture des ressources « fichier » (US-FORM-06) : lien signé à durée
 * courte, puis lecture en flux par ce lien (seule route sans jeton d'accès :
 * un `<video>` ou un nouvel onglet ne peut pas l'envoyer ; le lien, lui,
 * expire au bout de 10 minutes).
 */
@ApiTags('ressources')
@Controller()
export class FichiersRessourcesController {
  constructor(private readonly fichiers: FichiersRessourcesService) {}

  @Post('ressources/:ressourceId/lien')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @Roles(Role.APPRENANT, Role.FORMATEUR, Role.ADMINISTRATEUR)
  @ApiOperation({
    summary: 'Obtenir un lien de lecture signé (10 min) vers une ressource « fichier »',
    description:
      'Administrateur ; formateur affecté ; apprenant inscrit (EN_COURS ou TERMINEE). ' +
      'Le lien ne vaut que pour cette ressource et expire au bout de 10 minutes.',
  })
  @ApiResponse({ status: 200, description: '{ url, expireDansSecondes }.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description: 'Formateur non affecté, apprenant non inscrit ou suspendu (refus tracé).',
  })
  @ApiResponse({ status: 404, description: 'Ressource introuvable, ou ce n’est pas un fichier.' })
  lien(
    @Param('ressourceId', ParseUUIDPipe) ressourceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LienLecture> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.fichiers.lienLecture(
      { id: req.user.sub, role: req.user.role as Role },
      ressourceId,
      {
        adresseIp: req.ip ?? null,
        methode: req.method,
        route: req.originalUrl,
      },
    );
  }

  @Get('ressources/fichiers/:jeton')
  @Public()
  @ApiOperation({
    summary: 'Lire le fichier d’un lien signé (flux, plages d’octets)',
    description:
      'Formats lisibles (PDF, images, vidéo MP4/WebM, audio) : affichés dans le navigateur ' +
      '(`inline`, vrai type) ; tout le reste : téléchargement (`attachment`, ' +
      '`application/octet-stream`). `Range` -> 206.',
  })
  @ApiResponse({ status: 200, description: 'Le fichier entier.' })
  @ApiResponse({ status: 206, description: 'La plage demandée.' })
  @ApiResponse({ status: 404, description: 'Lien expiré ou invalide.' })
  @ApiResponse({ status: 416, description: 'Plage hors du fichier.' })
  @ApiResponse({ status: 503, description: 'Stockage indisponible.' })
  async servir(
    @Param('jeton') jeton: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const fichier = await this.fichiers.servir(jeton, range);
      res.status(fichier.statut).set(fichier.entetes);
      fichier.flux.on('error', () => res.destroy());
      res.on('close', () => fichier.flux.destroy());
      fichier.flux.pipe(res);
    } catch (erreur) {
      if (erreur instanceof PlageInsatisfaisable) {
        res
          .status(416)
          .set('Content-Range', `bytes */${erreur.taille}`)
          .json({ statusCode: 416, message: erreur.message });
        return;
      }
      throw erreur;
    }
  }
}

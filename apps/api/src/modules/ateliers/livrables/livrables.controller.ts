import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { ErreursDepotFilter, NettoyageFichiersInterceptor, OPTIONS_DEPOT } from './depot-fichiers';
import { LivrablesService, LivrableVue } from './livrables.service';
import { SoumettreLivrableDto } from './soumettre-livrable.dto';

/**
 * Livrables — côté APPRENANT (US-ATEL-04, DS-03 partie 1, UC4 Apprenant).
 * Route de DS-03 : `POST /ateliers/:atelierId/livrable`, en multipart
 * (fichiers dans le champ `fichiers`, plus `commentaire` et `liens`).
 * L'apprenant est toujours celui du jeton. Remplacement : `PUT` sur la même
 * route (US-ATEL-05). La correction (US-ATEL-06) a ses propres routes.
 */
@ApiBearerAuth('access-token')
@ApiTags('ateliers')
@Roles(Role.APPRENANT)
@Controller()
export class LivrablesController {
  constructor(private readonly livrablesService: LivrablesService) {}

  @Post('ateliers/:atelierId/livrable')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(ErreursDepotFilter)
  @UseInterceptors(
    NettoyageFichiersInterceptor,
    FilesInterceptor('fichiers', OPTIONS_DEPOT.limits?.files, OPTIONS_DEPOT),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichiers'],
      properties: {
        fichiers: { type: 'array', items: { type: 'string', format: 'binary' } },
        commentaire: { type: 'string', maxLength: 2000 },
        liens: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 5 },
      },
    },
  })
  @ApiOperation({
    summary: 'Soumettre un livrable pour un atelier publié (US-ATEL-04)',
    description:
      'Fichiers contrôlés contre l’atelier (extension, signature, taille, nombre) ; SHA-256 de ' +
      'chaque fichier et hash de traçabilité ; dépôt sur MinIO/S3 ; livrable version 1, statut ' +
      'SOUMIS, marqué en retard s’il arrive pendant la tolérance (horloge PostgreSQL à la ' +
      'réception) ; email aux formateurs affectés. Un seul livrable par atelier.',
  })
  @ApiResponse({ status: 201, description: 'Livrable enregistré ; audit LIVRABLE_SOUMIS.' })
  @ApiResponse({
    status: 400,
    description:
      'Aucun fichier, trop de fichiers, format non autorisé, contenu non conforme à ' +
      'l’extension, fichier vide ou trop volumineux, commentaire ou lien invalide (rien ' +
      'n’est enregistré).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Rôle autre qu’apprenant, pas inscrit, inscription suspendue (tracé) ou formation terminée.',
  })
  @ApiResponse({ status: 404, description: 'Atelier introuvable ou pas encore publié.' })
  @ApiResponse({
    status: 409,
    description: 'Date limite (et tolérance) dépassée, ou livrable déjà soumis.',
  })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  soumettre(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @UploadedFiles() fichiers: Express.Multer.File[] | undefined,
    @Body() dto: SoumettreLivrableDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LivrableVue> {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.livrablesService.soumettre(req.user.sub, atelierId, fichiers ?? [], dto, {
      adresseIp: req.ip ?? null,
      methode: req.method,
      route: req.originalUrl,
    });
  }

  @Put('ateliers/:atelierId/livrable')
  @HttpCode(HttpStatus.OK)
  @UseFilters(ErreursDepotFilter)
  @UseInterceptors(
    NettoyageFichiersInterceptor,
    FilesInterceptor('fichiers', OPTIONS_DEPOT.limits?.files, OPTIONS_DEPOT),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichiers'],
      properties: {
        fichiers: { type: 'array', items: { type: 'string', format: 'binary' } },
        commentaire: { type: 'string', maxLength: 2000 },
        liens: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 5 },
      },
    },
  })
  @ApiOperation({
    summary: 'Remplacer mon livrable avant la date limite (US-ATEL-05)',
    description:
      'Mêmes contrôles de fichiers que le dépôt ; livrable SOUMIS et date limite non atteinte ; ' +
      'version + 1, hash de traçabilité recalculé, fichiers remplacés ; anciens objets retirés ' +
      'du stockage après l’enregistrement.',
  })
  @ApiResponse({ status: 200, description: 'Livrable remplacé ; audit LIVRABLE_REMPLACE.' })
  @ApiResponse({ status: 400, description: 'Fichiers, commentaire ou liens invalides.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description:
      'Rôle autre qu’apprenant, pas inscrit, inscription suspendue ou formation terminée.',
  })
  @ApiResponse({ status: 404, description: 'Atelier introuvable, ou aucun livrable déposé.' })
  @ApiResponse({
    status: 409,
    description:
      'Date limite passée, livrable en correction ou noté, remplacement simultané, formation archivée.',
  })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  remplacer(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @UploadedFiles() fichiers: Express.Multer.File[] | undefined,
    @Body() dto: SoumettreLivrableDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LivrableVue> {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.livrablesService.remplacer(req.user.sub, atelierId, fichiers ?? [], dto, {
      adresseIp: req.ip ?? null,
      methode: req.method,
      route: req.originalUrl,
    });
  }
}

import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
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
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  FiltreInscriptionsDto,
  InscrireApprenantDto,
  SuspendreInscriptionDto,
} from './admin-inscriptions.dto';
import {
  AdminInscriptionsService,
  InscriptionAdminVue,
  RapportImport,
} from './admin-inscriptions.service';
import { BORNES_IMPORT, MESSAGE_IMPORT_TROP_GROS } from './import-inscriptions.regles';

export const MESSAGE_FICHIER_CSV_MANQUANT = 'Joignez un fichier CSV (champ « fichier »).';

const MESSAGES_MULTER: Record<string, [number, string]> = {
  'File too large': [413, MESSAGE_IMPORT_TROP_GROS],
  'Too many files': [400, 'Un seul fichier par import.'],
  'Unexpected field': [400, MESSAGE_FICHIER_CSV_MANQUANT],
  'Too many fields': [400, 'Trop de champs dans le formulaire.'],
};

/** Refus de multer (anglais) -> message français, statut conservé (413 pour la taille). */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursImportFilter implements ExceptionFilter {
  catch(exception: HttpException, hote: ArgumentsHost): void {
    const res = hote.switchToHttp().getResponse<Response>();
    const corps = exception.getResponse();
    const message =
      typeof corps === 'object' && corps !== null
        ? (corps as { message?: unknown }).message
        : corps;
    const traduit = typeof message === 'string' ? MESSAGES_MULTER[message] : undefined;
    if (traduit) {
      res.status(traduit[0]).json({ statusCode: traduit[0], message: traduit[1] });
      return;
    }
    res
      .status(exception.getStatus())
      .json(typeof corps === 'object' ? corps : { statusCode: exception.getStatus(), message });
  }
}

/**
 * US-INSC-02 — Gérer les inscriptions d'une formation (UC4 Administrateur,
 * DS-08 P3, DS-11 P2). Administrateur seulement. On suspend, on ne supprime
 * jamais une inscription.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin-inscriptions')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin')
export class AdminInscriptionsController {
  constructor(private readonly service: AdminInscriptionsService) {}

  @Get('formations/:formationId/inscriptions')
  @ApiOperation({ summary: 'Inscriptions d’une formation (US-INSC-02)' })
  @ApiResponse({ status: 200, description: 'Inscriptions, apprenant et motif de suspension.' })
  @ApiResponse({ status: 400, description: 'Identifiant ou filtre invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  lister(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Query() filtre: FiltreInscriptionsDto,
  ): Promise<InscriptionAdminVue[]> {
    return this.service.lister(formationId, filtre.statut);
  }

  @Post('formations/:formationId/inscriptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Inscrire un apprenant par son email (US-INSC-02)',
    description:
      'Compte APPRENANT actif ; formation OUVERTE ; capacité respectée (verrou). Email de bienvenue.',
  })
  @ApiResponse({ status: 201, description: 'Inscription EN_COURS ; audit INSCRIPTION_AJOUTEE.' })
  @ApiResponse({ status: 400, description: 'Email invalide ; champ inconnu.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation ou compte introuvable.' })
  @ApiResponse({
    status: 409,
    description:
      'Déjà inscrit, suspendu, pas apprenant, compte inactif, formation complète ou non ouverte.',
  })
  inscrire(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: InscrireApprenantDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InscriptionAdminVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.inscrire(req.user.sub, formationId, dto.email, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('formations/:formationId/inscriptions/import')
  @HttpCode(HttpStatus.OK)
  @UseFilters(ErreursImportFilter)
  @UseInterceptors(
    FileInterceptor('fichier', {
      storage: memoryStorage(),
      limits: { fileSize: BORNES_IMPORT.tailleMaxOctets, files: 1, fields: 2 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichier'],
      properties: { fichier: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Importer des inscriptions depuis un CSV (US-INSC-02)',
    description:
      'Une adresse email par ligne (en-tête « email » facultatif) ; 64 Ko et 500 lignes au plus. ' +
      'Rapport ligne par ligne ; une ligne refusée n’empêche pas les suivantes.',
  })
  @ApiResponse({ status: 200, description: 'Rapport ; audit INSCRIPTIONS_IMPORTEES.' })
  @ApiResponse({ status: 400, description: 'Fichier manquant, vide, trop long ou non texte.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation non ouverte.' })
  @ApiResponse({ status: 413, description: 'Fichier de plus de 64 Ko.' })
  importer(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<RapportImport> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    if (!fichier) throw new BadRequestException(MESSAGE_FICHIER_CSV_MANQUANT);
    return this.service.importer(req.user.sub, formationId, fichier.buffer, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('inscriptions/:inscriptionId/suspendre')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspendre une inscription, motif obligatoire (US-INSC-02)' })
  @ApiResponse({ status: 200, description: 'SUSPENDUE ; audit ; email à l’apprenant.' })
  @ApiResponse({ status: 400, description: 'Motif manquant ou trop long.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Inscription introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà suspendue, terminée, ou formation archivée.' })
  suspendre(
    @Param('inscriptionId', ParseUUIDPipe) inscriptionId: string,
    @Body() dto: SuspendreInscriptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InscriptionAdminVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.suspendre(req.user.sub, inscriptionId, dto.motif, {
      adresseIp: req.ip ?? null,
    });
  }

  @Post('inscriptions/:inscriptionId/reactiver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réactiver (ré-inscrire) une inscription suspendue (US-INSC-02)' })
  @ApiResponse({ status: 200, description: 'EN_COURS ; audit ; email à l’apprenant.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Inscription introuvable.' })
  @ApiResponse({ status: 409, description: 'Pas suspendue, formation complète ou archivée.' })
  reactiver(
    @Param('inscriptionId', ParseUUIDPipe) inscriptionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<InscriptionAdminVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.reactiver(req.user.sub, inscriptionId, { adresseIp: req.ip ?? null });
  }
}

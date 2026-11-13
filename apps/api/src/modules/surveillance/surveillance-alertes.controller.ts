import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AlerteSurveillanceVue,
  StatutAlerteSurveillance,
  SurveillanceAlertesService,
} from './surveillance-alertes.service';
import { TAILLE_MAX_PHOTO_ALERTE, TYPES_EVENEMENT, TypeEvenement } from './surveillance.regles';

export class ExamenAlerteDto {
  @ApiProperty({ enum: ['NOUVEAU', 'EXAMINE'] })
  @IsIn(['NOUVEAU', 'EXAMINE'], { message: 'Statut : NOUVEAU ou EXAMINE.' })
  statut: StatutAlerteSurveillance;
}

export class FileAlertesQuery {
  @IsOptional()
  @IsIn(['NOUVEAU', 'EXAMINE'], { message: 'Statut : NOUVEAU ou EXAMINE.' })
  statut?: StatutAlerteSurveillance;
}

/** US-QCM-15 — Alertes de la surveillance par IA (photo du moment de la détection). */
@ApiTags('qcm')
@Controller()
export class SurveillanceAlertesController {
  constructor(private readonly service: SurveillanceAlertesService) {}

  @ApiBearerAuth('access-token')
  @Roles(Role.APPRENANT)
  @Post('tentatives/:tentativeId/alertes-surveillance')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      // Au-dessus de la borne métier : le service répond 413 en français.
      limits: { fileSize: TAILLE_MAX_PHOTO_ALERTE * 2, files: 1, fields: 2 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'photo'],
      properties: {
        type: { type: 'string', enum: [...TYPES_EVENEMENT] },
        confiance: { type: 'number', minimum: 0, maximum: 1 },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Signaler une anomalie détectée par l’IA, avec la photo du moment (US-QCM-15)',
  })
  @ApiResponse({ status: 201, description: '`{ id, type, detecteLe }`.' })
  @ApiResponse({ status: 400, description: 'Type inconnu, photo absente ou non JPEG / PNG.' })
  @ApiResponse({ status: 404, description: 'Tentative introuvable (ou d’un autre apprenant).' })
  @ApiResponse({ status: 409, description: 'Tentative terminée, non surveillée, ou plafond.' })
  @ApiResponse({ status: 413, description: 'Photo de plus de 200 Ko.' })
  @ApiResponse({ status: 429, description: 'Même alerte moins de 30 s après la précédente.' })
  deposer(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Body() corps: { type?: unknown; confiance?: unknown },
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; type: TypeEvenement; detecteLe: Date }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    if (!fichier) throw new BadRequestException('Joignez la photo (champ « photo »).');
    return this.service.deposer(
      req.user.sub,
      tentativeId,
      { type: corps?.type, confiance: corps?.confiance, photo: fichier.buffer },
      this.contexte(req),
    );
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Get('surveillance/alertes')
  @ApiQuery({ name: 'statut', required: false, enum: ['NOUVEAU', 'EXAMINE'] })
  @ApiOperation({ summary: 'Alertes de surveillance des formations du formateur (US-QCM-15)' })
  @ApiResponse({ status: 200, description: 'Nouvelles d’abord, puis les plus récentes ; 200 au plus.' })
  file(
    @Query() query: FileAlertesQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteSurveillanceVue[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.file(
      { id: req.user.sub, role: req.user.role },
      query.statut ?? null,
      this.contexte(req),
    );
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Get('surveillance/alertes/a-examiner')
  @ApiOperation({ summary: 'Nombre d’alertes de surveillance à examiner (US-QCM-15)' })
  @ApiResponse({ status: 200, description: '`{ nombre }`.' })
  aExaminer(@Req() req: AuthenticatedRequest): Promise<{ nombre: number }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.aExaminer({ id: req.user.sub, role: req.user.role });
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Get('tentatives/:tentativeId/alertes-surveillance')
  @ApiOperation({ summary: 'Alertes de surveillance d’une tentative (US-QCM-15)' })
  @ApiResponse({ status: 200, description: 'Dans l’ordre de détection.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (ACCES_RESSOURCE_REFUSE).' })
  @ApiResponse({ status: 404, description: 'Tentative introuvable.' })
  deTentative(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteSurveillanceVue[]> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.deTentative(
      { id: req.user.sub, role: req.user.role },
      tentativeId,
      this.contexte(req),
    );
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Patch('surveillance/alertes/:alerteId')
  @ApiOperation({ summary: 'Marquer une alerte examinée, ou à examiner (US-QCM-15)' })
  @ApiResponse({ status: 200, description: 'Alerte mise à jour ; journalisé.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (ACCES_RESSOURCE_REFUSE).' })
  @ApiResponse({ status: 404, description: 'Alerte introuvable.' })
  examiner(
    @Param('alerteId', ParseUUIDPipe) alerteId: string,
    @Body() dto: ExamenAlerteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AlerteSurveillanceVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.examiner(
      { id: req.user.sub, role: req.user.role },
      alerteId,
      dto.statut,
      this.contexte(req),
    );
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Post('surveillance/alertes/:alerteId/lien')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lien signé (2 min) vers la photo d’une alerte (US-QCM-15)' })
  @ApiResponse({ status: 200, description: '`{ url, expireDansSecondes }`.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté.' })
  @ApiResponse({ status: 404, description: 'Alerte introuvable.' })
  lien(
    @Param('alerteId', ParseUUIDPipe) alerteId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string; expireDansSecondes: number }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.lien(
      { id: req.user.sub, role: req.user.role },
      alerteId,
      this.contexte(req),
    );
  }

  @Public()
  @Get('surveillance/alertes/photo/:jeton')
  @ApiOperation({ summary: 'Photo d’une alerte par lien signé (US-QCM-15)' })
  @ApiResponse({ status: 200, description: 'Image (no-store).' })
  @ApiResponse({ status: 404, description: 'Lien expiré ou invalide.' })
  async servir(
    @Param('jeton') jeton: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { flux, type, taille } = await this.service.servir(jeton);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(flux, { type, length: taille, disposition: 'inline' });
  }

  private contexte(req: AuthenticatedRequest): {
    adresseIp: string | null;
    methode: string;
    route: string;
  } {
    return { adresseIp: req.ip ?? null, methode: req.method, route: req.originalUrl };
  }
}

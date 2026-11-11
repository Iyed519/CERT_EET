import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
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
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { LimiteRequetesGuard } from '../../common/limite-requetes/limite-requetes.guard';
import { AppliquerLimite } from '../../common/limite-requetes/limite-requetes.decorator';
import { CaptureVue, CapturesTentativeVue, SurveillanceService } from './surveillance.service';

/** Corps du refus explicite de la surveillance (avant le démarrage). */
export class RefusSurveillanceDto {
  @ApiProperty({ enum: ['REFUS', 'CAMERA_INDISPONIBLE'] })
  @IsIn(['REFUS', 'CAMERA_INDISPONIBLE'], { message: 'Motif : REFUS ou CAMERA_INDISPONIBLE.' })
  motif: 'REFUS' | 'CAMERA_INDISPONIBLE';
}

/** US-QCM-12 — Surveillance webcam par captures. */
@ApiTags('qcm')
@Controller()
export class SurveillanceController {
  constructor(private readonly service: SurveillanceService) {}

  @ApiBearerAuth('access-token')
  @Roles(Role.APPRENANT)
  @Post('qcm/:qcmId/surveillance/refus')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LimiteRequetesGuard)
  @AppliquerLimite({ nom: 'surveillance-refus', limite: 20, fenetreSecondes: 15 * 60 })
  @ApiOperation({ summary: 'Refuser la surveillance webcam d’un QCM (US-QCM-12)' })
  @ApiResponse({ status: 200, description: 'Refus journalisé ; procédure alternative.' })
  @ApiResponse({ status: 404, description: 'QCM introuvable ou non surveillé.' })
  refuser(
    @Param('qcmId', ParseUUIDPipe) qcmId: string,
    @Body() dto: RefusSurveillanceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.refuser(req.user.sub, qcmId, dto.motif, this.contexte(req));
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.APPRENANT)
  @Post('tentatives/:tentativeId/captures')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('capture', {
      storage: memoryStorage(),
      // Un peu au-dessus de la borne métier : le service répond 413 en français.
      limits: { fileSize: 200 * 1024, files: 1, fields: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['capture'],
      properties: { capture: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Déposer une capture webcam de sa tentative (US-QCM-12)' })
  @ApiResponse({ status: 201, description: 'Capture enregistrée.' })
  @ApiResponse({ status: 400, description: 'Pas une image JPEG / PNG, ou fichier absent.' })
  @ApiResponse({ status: 404, description: 'Tentative introuvable (ou d’un autre apprenant).' })
  @ApiResponse({
    status: 409,
    description: 'Tentative terminée, non surveillée, ou nombre maximal atteint.',
  })
  @ApiResponse({ status: 413, description: 'Capture de plus de 100 Ko.' })
  @ApiResponse({ status: 429, description: 'Capture trop rapprochée de la précédente.' })
  deposer(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<CaptureVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    if (!fichier) throw new BadRequestException('Joignez la capture (champ « capture »).');
    return this.service.deposer(req.user.sub, tentativeId, fichier.buffer);
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Get('tentatives/:tentativeId/captures')
  @ApiOperation({
    summary: 'Captures webcam d’une tentative (US-QCM-12, formateur affecté ou admin)',
  })
  @ApiResponse({ status: 200, description: 'Liste des captures ; consultation journalisée.' })
  @ApiResponse({
    status: 403,
    description: 'Formateur non affecté (ACCES_RESSOURCE_REFUSE) ou rôle insuffisant.',
  })
  @ApiResponse({ status: 404, description: 'Tentative introuvable.' })
  lister(
    @Param('tentativeId', ParseUUIDPipe) tentativeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CapturesTentativeVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.lister(
      { id: req.user.sub, role: req.user.role },
      tentativeId,
      this.contexte(req),
    );
  }

  @ApiBearerAuth('access-token')
  @Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
  @Post('captures/:captureId/lien')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lien signé (2 min) vers une capture (US-QCM-12)' })
  @ApiResponse({ status: 200, description: '`{ url, expireDansSecondes }`.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté ou rôle insuffisant.' })
  @ApiResponse({ status: 404, description: 'Capture introuvable.' })
  lien(
    @Param('captureId', ParseUUIDPipe) captureId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string; expireDansSecondes: number }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.lien(
      { id: req.user.sub, role: req.user.role },
      captureId,
      this.contexte(req),
    );
  }

  @Public()
  @Get('captures/fichier/:jeton')
  @ApiOperation({ summary: 'Image d’une capture par lien signé (US-QCM-12)' })
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

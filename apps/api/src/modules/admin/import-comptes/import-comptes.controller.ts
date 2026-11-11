import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
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
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { BORNES_IMPORT_COMPTES, MESSAGE_TROP_GROS } from './import-comptes.regles';
import { ImportComptesService, RapportImportComptes } from './import-comptes.service';

export const MESSAGE_FICHIER_MANQUANT = 'Joignez un fichier CSV (champ « fichier »).';

const MESSAGES_MULTER: Record<string, [number, string]> = {
  'File too large': [413, MESSAGE_TROP_GROS],
  'Too many files': [400, 'Un seul fichier par import.'],
  'Unexpected field': [400, MESSAGE_FICHIER_MANQUANT],
  'Too many fields': [400, 'Trop de champs dans le formulaire.'],
};

/** Refus de multer (anglais) -> message français ; le rapport d'import passe tel quel. */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursImportComptesFilter implements ExceptionFilter {
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
 * US-CPT-02 — Import CSV de comptes et renvoi de l'email d'activation
 * (administrateur seulement).
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/users')
export class ImportComptesController {
  constructor(private readonly service: ImportComptesService) {}

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(ErreursImportComptesFilter)
  @UseInterceptors(
    FileInterceptor('fichier', {
      storage: memoryStorage(),
      limits: { fileSize: BORNES_IMPORT_COMPTES.tailleMaxOctets, files: 1, fields: 2 },
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
    summary: 'Importer des comptes depuis un CSV (US-CPT-02)',
    description:
      'En-tête obligatoire : email;nom;prenom;role (role facultative : APPRENANT ou FORMATEUR). ' +
      '256 Ko et 500 comptes au plus. Tout ou rien : la moindre ligne en erreur bloque l’import.',
  })
  @ApiResponse({
    status: 201,
    description: 'Comptes créés (EN_ATTENTE_ACTIVATION) ; emails d’activation en file.',
  })
  @ApiResponse({
    status: 400,
    description: 'Fichier inexploitable, ou rapport ligne par ligne (aucun compte créé).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({
    status: 409,
    description: 'Collision avec un compte créé pendant l’import (rien créé).',
  })
  @ApiResponse({ status: 413, description: 'Fichier de plus de 256 Ko.' })
  importer(
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<RapportImportComptes> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    if (!fichier) throw new BadRequestException(MESSAGE_FICHIER_MANQUANT);
    return this.service.importer(req.user.sub, fichier.buffer, { adresseIp: req.ip ?? null });
  }

  @Post(':id/activation')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Renvoyer l'email d'activation d'un compte importé (US-CPT-02)" })
  @ApiResponse({
    status: 202,
    description: 'Nouvel email d’activation mis en file (l’ancien lien ne marche plus).',
  })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  @ApiResponse({ status: 409, description: 'Compte qui n’attend pas d’activation par lien.' })
  async renvoyerActivation(
    @Param('id', ParseUUIDPipe) userId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    await this.service.renvoyerActivation(req.user.sub, userId, { adresseIp: req.ip ?? null });
    return { message: "Un nouvel email d'activation va être envoyé." };
  }
}

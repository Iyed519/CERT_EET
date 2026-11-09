import {
  ArgumentsHost,
  BadRequestException,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { Observable, finalize } from 'rxjs';
import {
  BORNES_SUPPORT,
  MESSAGE_FICHIER_ABSENT,
  MESSAGE_SUPPORT_TROP_GROS,
} from './support.regles';

/** Champs texte du dépôt (multipart, à côté du fichier). */
export class DeposerSupportDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Titre affiché ; par défaut, le nom du fichier sans son extension.',
  })
  @IsOptional()
  @IsString({ message: 'Le titre doit être un texte.' })
  @MaxLength(BORNES_SUPPORT.titreMax, { message: 'Le titre fait 200 caractères au plus.' })
  titre?: string;
}

/** Dossier des fichiers reçus, le temps du traitement de la requête. */
export const DOSSIER_SUPPORTS = join(tmpdir(), 'cert-eet-supports');

/**
 * Options multer du dépôt d'un support (US-IA-01) : UN fichier, écrit sur
 * DISQUE sous un nom aléatoire (jamais le nom d'origine comme chemin), 20 Mo
 * au plus ; champs texte bornés.
 */
export const OPTIONS_DEPOT_SUPPORT: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _fichier, rappel) => {
      mkdirSync(DOSSIER_SUPPORTS, { recursive: true });
      rappel(null, DOSSIER_SUPPORTS);
    },
    filename: (_req, _fichier, rappel) => rappel(null, randomUUID()),
  }),
  limits: {
    fileSize: BORNES_SUPPORT.tailleMaxOctets,
    files: 1,
    fields: 5,
    fieldSize: 4 * 1024,
  },
};

/** Supprime le fichier temporaire à la fin de la requête, quelle qu'en soit l'issue. */
@Injectable()
export class NettoyageSupportInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NettoyageSupportInterceptor.name);

  intercept(contexte: ExecutionContext, suite: CallHandler): Observable<unknown> {
    const req = contexte.switchToHttp().getRequest<Request>();
    return suite.handle().pipe(
      finalize(() => {
        const fichier = req.file as Express.Multer.File | undefined;
        if (!fichier?.path) return;
        unlink(fichier.path).catch((erreur: unknown) => {
          const detail = erreur instanceof Error ? erreur.message : String(erreur);
          this.logger.warn(`Fichier temporaire non supprimé (${fichier.path}) : ${detail}`);
        });
      }),
    );
  }
}

const MESSAGES_MULTER: Record<string, string> = {
  'File too large': MESSAGE_SUPPORT_TROP_GROS,
  'Too many files': 'Un seul fichier par dépôt.',
  'Unexpected field': MESSAGE_FICHIER_ABSENT,
  'Field value too long': 'Un champ texte est trop long.',
  'Too many fields': 'Trop de champs dans le formulaire.',
};

/** Refus de multer (413, 400 en anglais) -> 400 avec un message français. */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursDepotSupportFilter implements ExceptionFilter {
  catch(exception: HttpException, hote: ArgumentsHost): void {
    const res = hote.switchToHttp().getResponse<Response>();
    const corps = exception.getResponse();
    const message =
      typeof corps === 'object' && corps !== null
        ? (corps as { message?: unknown }).message
        : corps;
    const traduit = typeof message === 'string' ? MESSAGES_MULTER[message] : undefined;
    if (traduit) {
      res.status(400).json({ statusCode: 400, message: traduit, error: 'Bad Request' });
      return;
    }
    res
      .status(exception.getStatus())
      .json(typeof corps === 'object' ? corps : { statusCode: exception.getStatus(), message });
  }
}

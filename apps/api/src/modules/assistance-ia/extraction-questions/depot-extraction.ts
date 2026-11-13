import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BORNES_EXTRACTION,
  MESSAGE_EXTRACTION_TROP_GROS,
  MESSAGE_FICHIER_EXTRACTION_ABSENT,
} from './extraction-questions.regles';

/** Dossier des fichiers reçus, le temps de la requête (supprimés ensuite). */
export const DOSSIER_EXTRACTIONS = join(tmpdir(), 'cert-eet-extractions');

/**
 * Options multer du dépôt d'un document à extraire (US-IA-08) : UN fichier,
 * sur DISQUE sous un nom aléatoire (jamais le nom d'origine comme chemin),
 * 10 Mo au plus, aucun autre champ utile.
 */
export const OPTIONS_DEPOT_EXTRACTION: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _fichier, rappel) => {
      mkdirSync(DOSSIER_EXTRACTIONS, { recursive: true });
      rappel(null, DOSSIER_EXTRACTIONS);
    },
    filename: (_req, _fichier, rappel) => rappel(null, randomUUID()),
  }),
  limits: {
    fileSize: BORNES_EXTRACTION.tailleMaxOctets,
    files: 1,
    fields: 2,
    fieldSize: 1024,
  },
};

const MESSAGES_MULTER: Record<string, string> = {
  'File too large': MESSAGE_EXTRACTION_TROP_GROS,
  'Too many files': 'Un seul fichier par dépôt.',
  'Unexpected field': MESSAGE_FICHIER_EXTRACTION_ABSENT,
  'Field value too long': 'Un champ texte est trop long.',
  'Too many fields': 'Trop de champs dans le formulaire.',
};

/** Refus de multer (413, 400 en anglais) -> 400 avec un message français. */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursDepotExtractionFilter implements ExceptionFilter {
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

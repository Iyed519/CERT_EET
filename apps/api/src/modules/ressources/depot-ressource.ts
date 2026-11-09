import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { BORNES_FICHIER, MESSAGE_FICHIER_MANQUANT } from './fichier-ressource.regles';
import { BORNES_RESSOURCE } from './ressource.regles';

/** Champs texte du dépôt d'un fichier (multipart). */
export class DeposerFichierRessourceDto {
  @ApiPropertyOptional({ maxLength: 200, description: 'Par défaut : le nom du fichier.' })
  @IsOptional()
  @IsString({ message: 'Le titre doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.titreMax, { message: 'Le titre fait 200 caractères au plus.' })
  titre?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'La description doit être un texte.' })
  @MaxLength(BORNES_RESSOURCE.descriptionMax, {
    message: 'La description fait 500 caractères au plus.',
  })
  description?: string;
}

export const DOSSIER_RESSOURCES = join(tmpdir(), 'cert-eet-ressources');

/**
 * Options multer : UN fichier, sur DISQUE sous un nom aléatoire, plafond
 * ABSOLU de 1 Gio (celui de nginx et de la base) ; la taille maximale
 * configurée (RESSOURCES_TAILLE_MAX_MO) est vérifiée ensuite -> 413.
 */
export const OPTIONS_DEPOT_RESSOURCE: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _fichier, rappel) => {
      mkdirSync(DOSSIER_RESSOURCES, { recursive: true });
      rappel(null, DOSSIER_RESSOURCES);
    },
    filename: (_req, _fichier, rappel) => rappel(null, randomUUID()),
  }),
  limits: {
    fileSize: BORNES_FICHIER.tailleAbsolueMaxOctets,
    files: 1,
    fields: 5,
    fieldSize: 4 * 1024,
  },
};

const MESSAGES_MULTER: Record<string, [number, string]> = {
  'File too large': [413, 'Le fichier dépasse 1 Go, la taille maximale absolue.'],
  'Too many files': [400, 'Un seul fichier par dépôt.'],
  'Unexpected field': [400, MESSAGE_FICHIER_MANQUANT],
  'Field value too long': [400, 'Un champ texte est trop long.'],
  'Too many fields': [400, 'Trop de champs dans le formulaire.'],
};

/** Refus de multer (anglais) -> message français, statut conservé (413 pour la taille). */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursDepotRessourceFilter implements ExceptionFilter {
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

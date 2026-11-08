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
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { Observable, finalize } from 'rxjs';
import { BORNES_LIVRABLE } from './livrable.regles';

/** Dossier des fichiers reçus, le temps du traitement de la requête. */
export const DOSSIER_TEMPORAIRE = join(tmpdir(), 'cert-eet-livrables');

/**
 * Options multer du dépôt (US-ATEL-04) :
 *  - fichiers écrits sur DISQUE (jamais en mémoire : jusqu'à 10 × 100 Mo),
 *    sous un nom aléatoire — le nom d'origine n'est jamais un chemin ;
 *  - plafonds ABSOLUS (100 Mo par fichier, 11 fichiers pour que la règle de
 *    l'atelier — 10 au plus — donne elle-même son message) ; les limites de
 *    l'atelier sont vérifiées ensuite par les règles pures ;
 *  - champs texte bornés (commentaire de 2 000 caractères, 5 liens).
 */
export const OPTIONS_DEPOT: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _fichier, rappel) => {
      mkdirSync(DOSSIER_TEMPORAIRE, { recursive: true });
      rappel(null, DOSSIER_TEMPORAIRE);
    },
    filename: (_req, _fichier, rappel) => rappel(null, randomUUID()),
  }),
  limits: {
    fileSize: BORNES_LIVRABLE.tailleAbsolueMaxOctets,
    files: BORNES_LIVRABLE.fichiersAbsolusMax + 1,
    fields: 20,
    fieldSize: 16 * 1024,
  },
};

/**
 * Supprime les fichiers temporaires à la fin de la requête, qu'elle réussisse
 * ou non (refus 400 / 403 / 409, validation du DTO, erreur du stockage).
 * Déclaré AVANT FilesInterceptor : il enveloppe l'upload et le traitement.
 */
@Injectable()
export class NettoyageFichiersInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NettoyageFichiersInterceptor.name);

  intercept(contexte: ExecutionContext, suite: CallHandler): Observable<unknown> {
    const req = contexte.switchToHttp().getRequest<Request>();
    return suite.handle().pipe(
      finalize(() => {
        const fichiers = (req.files as Express.Multer.File[] | undefined) ?? [];
        for (const f of fichiers) {
          unlink(f.path).catch((erreur: unknown) => {
            const detail = erreur instanceof Error ? erreur.message : String(erreur);
            this.logger.warn(`Fichier temporaire non supprimé (${f.path}) : ${detail}`);
          });
        }
      }),
    );
  }
}

/** Messages anglais de multer -> messages français (400, comme les autres refus de format). */
const MESSAGES_MULTER: Record<string, string> = {
  'File too large': 'Un fichier dépasse 100 Mo, la taille maximale absolue.',
  'Too many files': `Trop de fichiers : ${BORNES_LIVRABLE.fichiersAbsolusMax} au plus par soumission.`,
  'Unexpected field':
    'Champ de fichier inattendu : joignez les fichiers dans le champ « fichiers ».',
  'Field value too long': 'Un champ texte est trop long.',
  'Too many fields': 'Trop de champs dans le formulaire.',
};

/**
 * Traduit les refus de multer (413 « File too large », 400 « Too many
 * files »…) en 400 avec un message français. Les autres erreurs passent
 * inchangées, au format habituel de Nest.
 */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErreursDepotFilter implements ExceptionFilter {
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

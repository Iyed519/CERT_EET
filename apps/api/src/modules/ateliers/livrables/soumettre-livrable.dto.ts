import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { BORNES_LIVRABLE } from './livrable.regles';

/**
 * Champs texte du formulaire de dépôt (multipart/form-data, US-ATEL-04). Les
 * fichiers arrivent à part (champ `fichiers`, FilesInterceptor). Les bornes
 * sont revérifiées par les règles pures (nettoyerCommentaire, normaliserLiens).
 */
export class SoumettreLivrableDto {
  @ApiPropertyOptional({
    description: 'Commentaire libre pour le formateur (2 000 caractères au plus).',
    maxLength: BORNES_LIVRABLE.commentaireMax,
  })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être un texte.' })
  @MaxLength(BORNES_LIVRABLE.commentaireMax, {
    message: 'Le commentaire dépasse 2 000 caractères.',
  })
  commentaire?: string;

  @ApiPropertyOptional({
    description: 'Liens externes http(s) (GitHub, Drive, déploiement…), 5 au plus.',
    type: [String],
    maxItems: BORNES_LIVRABLE.liensMax,
  })
  @IsOptional()
  // En multipart, un champ répété arrive en tableau, un champ unique en texte.
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray({ message: 'Les liens doivent être une liste.' })
  @ArrayMaxSize(BORNES_LIVRABLE.liensMax, { message: '5 liens au plus par soumission.' })
  @IsString({ each: true, message: 'Chaque lien doit être un texte.' })
  @MaxLength(BORNES_LIVRABLE.lienLongueurMax, {
    each: true,
    message: 'Un lien dépasse 500 caractères.',
  })
  liens?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/** US-INSC-03 — Confirmation explicite, après affichage des conséquences. */
export class ConfirmerDesinscriptionDto {
  @ApiProperty({ example: true, description: 'Doit valoir true (confirmation explicite).' })
  @Equals(true, { message: 'Confirmez explicitement votre désinscription (confirmer: true).' })
  confirmer: true;
}

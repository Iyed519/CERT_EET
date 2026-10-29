import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Une question n'a jamais autant d'options : borne de sécurité contre un corps démesuré. */
export const NB_MAX_OPTIONS_REPONSE = 20;

/**
 * Corps de PUT /tentatives/:tentativeId/reponses/:questionId (US-QCM-07,
 * DS-02 étape 3).
 *
 * La réponse à UNE question est remplacée en entier (décision D3) : renvoyer
 * deux fois le même corps donne le même résultat, et une liste vide efface la
 * réponse (D13). Le DTO vérifie la forme ; l'appartenance des options à la
 * question et au tirage est vérifiée par le service.
 */
export class EnregistrerReponseDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    example: ['3f0e2c1a-7b5d-4c7e-9a1b-2d3e4f5a6b7c'],
    description:
      'Options cochées (identifiants). Une au plus pour un QCU ou un Vrai/Faux ; ' +
      'liste vide = réponse effacée.',
  })
  @IsArray({ message: 'optionIds doit être une liste d’identifiants.' })
  @ArrayMaxSize(NB_MAX_OPTIONS_REPONSE, {
    message: `optionIds ne peut pas contenir plus de ${NB_MAX_OPTIONS_REPONSE} options.`,
  })
  @ArrayUnique({ message: 'optionIds ne doit pas contenir deux fois la même option.' })
  @IsUUID('all', { each: true, message: 'Chaque option doit être un identifiant UUID.' })
  optionIds: string[];
}

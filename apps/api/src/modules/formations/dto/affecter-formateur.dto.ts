import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * DTO d'affectation d'un formateur à une formation (US-FORM-03).
 *
 * Corps de POST /admin/formations/:formationId/formateurs. Je ne demande QUE
 * l'identifiant du formateur : la formation vient de l'URL, et l'auteur de
 * l'affectation (`affecte_par`) vient du jeton d'accès — jamais du corps. Le
 * ValidationPipe global refuse tout autre champ (forbidNonWhitelisted).
 */
export class AffecterFormateurDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c0f0e-9a51-4c5e-8f0a-2d0f6f3b7a11',
    description: 'Identifiant du compte à affecter (rôle FORMATEUR, statut ACTIF).',
  })
  @IsUUID(undefined, { message: 'formateurId doit être un UUID.' })
  formateurId: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO de rejet d'une demande de rôle par un administrateur (US-ROL-02).
 *
 * Corps de PATCH /admin/role-requests/:id/reject. Le `motif` est OBLIGATOIRE :
 * c'est la trace de la décision de rejet (audit DEMANDE_ROLE_TRAITEE) et
 * l'explication rendue au demandeur.
 */
export class RejectRoleRequestDto {
  @ApiProperty({ example: 'Dossier incomplet : préciser les cours concernés.' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de rejet est requis.' })
  @MaxLength(500, { message: 'Le motif ne peut excéder 500 caractères.' })
  motif: string;
}

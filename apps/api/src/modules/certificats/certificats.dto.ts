import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { MotifRevocation } from '../../database/enums/motif-revocation.enum';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';

/** Filtre de la liste des certificats (administrateur). */
export class FiltreCertificatsDto {
  @ApiPropertyOptional({ enum: StatutCertificat, description: 'Ne garder que ce statut.' })
  @IsOptional()
  @IsEnum(StatutCertificat, {
    message: 'Statut inconnu : EN_ATTENTE_GENERATION, EN_GENERATION, ACTIF ou REVOQUE.',
  })
  statut?: StatutCertificat;

  @ApiPropertyOptional({
    description:
      'US-DASH-02 : titulaire (email, prénom, nom), titre de la formation (contient, sans casse) ' +
      'ou identifiant exact du certificat.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte.' })
  @MaxLength(255, { message: 'La recherche ne peut pas dépasser 255 caractères.' })
  recherche?: string;

  @ApiPropertyOptional({
    enum: ['true'],
    description: 'US-CERT-02 : seulement les certificats en échec définitif.',
  })
  @IsOptional()
  @IsIn(['true'], { message: 'enEchec ne peut valoir que « true ».' })
  enEchec?: string;
}

/**
 * Révocation d'un certificat (US-CERT-06, DS-07) : motif, description
 * interne, double confirmation (case d'irréversibilité + mot de passe de
 * l'administrateur, revérifié par bcrypt -> 401 si faux).
 */
export class RevoquerCertificatDto {
  @ApiProperty({ enum: MotifRevocation, example: MotifRevocation.FRAUDE })
  @IsEnum(MotifRevocation, {
    message: 'Motif inconnu : FRAUDE, ERREUR_ADMIN, DISCIPLINAIRE ou JUDICIAIRE.',
  })
  motif: MotifRevocation;

  @ApiProperty({
    description: 'Description détaillée, interne (10 à 2 000 caractères) : jamais publiée.',
    example: 'Usurpation d’identité constatée lors de l’examen du 12/10.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La description doit être un texte.' })
  @Length(10, 2000, { message: 'La description doit compter entre 10 et 2 000 caractères.' })
  description: string;

  @ApiProperty({ description: 'Case « Je comprends que cette action est irréversible ».' })
  @Equals(true, { message: 'Confirmez que la révocation est irréversible.' })
  confirmationIrreversible: boolean;

  @ApiProperty({ example: 'MotDePasseAdmin123!' })
  @IsString({ message: 'Le mot de passe administrateur est requis.' })
  @IsNotEmpty({ message: 'Le mot de passe administrateur est requis.' })
  motDePasseAdmin: string;
}

/** Réémission (US-CERT-08) : confirmation explicite exigée. */
export class ReemettreCertificatDto {
  @ApiProperty({ description: 'Confirme la réémission d’un nouveau certificat.' })
  @Equals(true, { message: 'Confirmez la réémission du certificat.' })
  confirmer: boolean;
}

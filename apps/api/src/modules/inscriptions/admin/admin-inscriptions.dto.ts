import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { StatutInscription } from '../../../database/enums/statut-inscription.enum';

const nettoyer = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** US-INSC-02 — Inscrire un apprenant existant par son email. */
export class InscrireApprenantDto {
  @ApiProperty({ example: 'amel.benali@esprit.tn' })
  @Transform(nettoyer)
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @MaxLength(254, { message: 'Adresse email trop longue.' })
  email: string;
}

/** US-INSC-02 — Suspendre une inscription : motif obligatoire (1 à 500 caractères). */
export class SuspendreInscriptionDto {
  @ApiProperty({ example: 'Absences répétées non justifiées.', maxLength: 500 })
  @Transform(nettoyer)
  @IsString({ message: 'Le motif doit être un texte.' })
  @MinLength(1, { message: 'Le motif est obligatoire.' })
  @MaxLength(500, { message: 'Le motif fait 500 caractères au plus.' })
  motif: string;
}

/** US-INSC-02 — Filtre de la liste des inscriptions. */
export class FiltreInscriptionsDto {
  @ApiPropertyOptional({ enum: StatutInscription })
  @IsOptional()
  @IsEnum(StatutInscription, { message: 'Statut inconnu : EN_COURS, TERMINEE ou SUSPENDUE.' })
  statut?: StatutInscription;
}

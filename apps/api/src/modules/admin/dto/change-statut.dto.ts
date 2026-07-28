import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { StatutCompte } from '../../../database/enums/statut-compte.enum';

/**
 * Statuts qu'un administrateur peut poser via cette route (US-CPT-03).
 * Les deux autres valeurs de l'enum ne sont PAS administrables ici :
 * EN_ATTENTE_ACTIVATION est géré par la vérification d'email (US-CPT-05) et
 * ANONYMISE relève de l'effacement RGPD (US-CPT-04). On les exclut à l'entrée.
 */
export type StatutAdministrable = StatutCompte.ACTIF | StatutCompte.DESACTIVE;

/**
 * DTO du changement de statut par un administrateur (US-CPT-03).
 *
 * Corps de PATCH /admin/users/:id. Le ValidationPipe global (whitelist:true +
 * forbidNonWhitelisted, main.ts) rejette en 400 tout champ non déclaré ici, et
 * `@IsIn` verrouille les seules transitions autorisées (DESACTIVE ou ACTIF).
 *
 * Différence avec US-ROL-01 : AUCUN mot de passe admin n'est exigé ici (pas de
 * step-up). Posséder une session admin valide suffit à (dés)activer un compte.
 */
export class ChangeStatutDto {
  @ApiProperty({
    enum: [StatutCompte.ACTIF, StatutCompte.DESACTIVE],
    example: StatutCompte.DESACTIVE,
  })
  @IsIn([StatutCompte.ACTIF, StatutCompte.DESACTIVE], {
    message: 'Statut cible invalide : DESACTIVE ou ACTIF attendu.',
  })
  statut: StatutAdministrable;

  /**
   * Motif OBLIGATOIRE à la désactivation (traçabilité de la décision, écrit dans
   * l'audit), IGNORÉ à la réactivation. `@ValidateIf` n'active les contraintes
   * que lorsque `statut === DESACTIVE` : à la réactivation, un motif absent est
   * donc parfaitement valide.
   */
  @ApiPropertyOptional({ example: 'Départ de l\'entreprise.' })
  @ValidateIf((dto: ChangeStatutDto) => dto.statut === StatutCompte.DESACTIVE)
  @IsString()
  @IsNotEmpty({ message: 'Le motif est requis pour désactiver un compte.' })
  @MaxLength(500, { message: 'Le motif ne peut excéder 500 caractères.' })
  motif?: string;
}

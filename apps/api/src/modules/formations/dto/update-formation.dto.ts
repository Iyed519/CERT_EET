import { PartialType } from '@nestjs/swagger';
import { CreateFormationDto } from './create-formation.dto';

/**
 * DTO de modification d'une formation (US-FORM-01, volet « configurer »).
 *
 * Corps de PATCH /admin/formations/:id. Tous les champs de la création
 * deviennent facultatifs, avec les MÊMES règles de validation (PartialType
 * recopie les décorateurs) : je n'ai qu'une seule définition des règles.
 *
 * `statut` reste absent : clôturer / archiver est une autre story
 * (US-FORM-02), avec ses propres règles.
 *
 * Un champ facultatif peut être vidé en envoyant `null`. Pour les champs
 * obligatoires (titre, capacité, seuil), `null` est refusé par le service.
 */
export class UpdateFormationDto extends PartialType(CreateFormationDto) {}

import { PartialType } from '@nestjs/swagger';
import { CreateModuleDto } from './create-module.dto';

/**
 * DTO de modification d'un module (US-FORM-01).
 *
 * Corps de PATCH /admin/formations/:formationId/modules/:moduleId. Mêmes
 * règles que la création, tous les champs facultatifs. La description peut
 * être vidée avec `null` ; le titre, obligatoire, ne le peut pas.
 */
export class UpdateModuleDto extends PartialType(CreateModuleDto) {}

import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { FORMATEUR_FORMATION_KEY, SourceFormation } from './formateur-de-la-formation.constants';
import { FormateurDeLaFormationGuard } from './formateur-de-la-formation.guard';

/**
 * @FormateurDeLaFormation(...) — autorisation par ressource (US-AUTH-16,
 * ADR-11).
 *
 * Complète @Roles sans le remplacer : @Roles dit « vous êtes formateur »,
 * ce décorateur dit « vous êtes formateur de CETTE formation ». Un
 * administrateur passe toujours (accès global) ; un formateur doit être
 * affecté à la formation (table `formation_formateurs`, US-FORM-03), sinon
 * 403 et audit ACCES_RESSOURCE_REFUSE.
 *
 * Exemple : `@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)` puis
 * `@FormateurDeLaFormation({ qcmId: 'qcmId' })` sur une route
 * `/qcm/:qcmId/...`.
 *
 * Le module qui déclare le contrôleur doit importer FormationsModule : le
 * garde a besoin d'AutorisationRessourceService, que ce module exporte.
 */
export const FormateurDeLaFormation = (
  source: SourceFormation,
): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    SetMetadata(FORMATEUR_FORMATION_KEY, source),
    UseGuards(FormateurDeLaFormationGuard),
  );

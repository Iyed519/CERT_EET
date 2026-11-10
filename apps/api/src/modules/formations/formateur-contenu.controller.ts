import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from './autorisation/formateur-de-la-formation.decorator';
import { ContenuPedagogiqueDto } from './dto/contenu-pedagogique.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { FormationModulesService } from './formation-modules.service';
import { FormationVue, FormationsService, ModuleVue } from './formations.service';

/**
 * US-FORM-04 — Contenu pédagogique géré par le formateur affecté (révision
 * v1.4, ADR-11, DS-16 P1).
 *
 * Le formateur AFFECTÉ (ou l'administrateur) modifie la description, les
 * objectifs, les prérequis et les modules de la formation ; les réglages
 * institutionnels restent à l'administrateur (400 nommant le champ). Les
 * règles et l'audit sont ceux d'US-FORM-01 (mêmes services), l'acteur étant
 * le formateur : formation archivée -> 409 ; module portant une évaluation
 * ou une ressource -> suppression refusée (409) ; numérotation continue.
 * Formateur non affecté -> 403 + ACCES_RESSOURCE_REFUSE (garde US-AUTH-16).
 */
@ApiBearerAuth('access-token')
@ApiTags('formateur')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('formateur/formations/:formationId')
export class FormateurContenuController {
  constructor(
    private readonly formationsService: FormationsService,
    private readonly modulesService: FormationModulesService,
  ) {}

  @Patch('contenu')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({ summary: 'Modifier le contenu pédagogique de ma formation (US-FORM-04)' })
  @ApiResponse({
    status: 200,
    description: 'Formation ; audit FORMATION_MODIFIEE (acteur = formateur).',
  })
  @ApiResponse({
    status: 400,
    description:
      'Réglage institutionnel (titre, dates, durée, capacité, seuil, modèle, statut), champ inconnu ou vide.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Apprenant, ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  modifierContenu(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: ContenuPedagogiqueDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationVue> {
    const u = this.exigerUtilisateur(req);
    return this.formationsService.modifier(
      u.sub,
      formationId,
      { description: dto.description, objectifs: dto.objectifs, prerequis: dto.prerequis },
      { adresseIp: req.ip ?? null },
    );
  }

  @Post('modules')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({ summary: 'Ajouter un module en fin de ma formation (US-FORM-04)' })
  @ApiResponse({
    status: 201,
    description: 'Module créé en dernière position ; audit MODULE_CREE.',
  })
  @ApiResponse({ status: 400, description: 'Titre manquant ou trop long, champ inconnu.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  ajouterModule(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: CreateModuleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue> {
    const u = this.exigerUtilisateur(req);
    return this.modulesService.ajouter(u.sub, formationId, dto, { adresseIp: req.ip ?? null });
  }

  @Put('modules/ordre')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({ summary: 'Réordonner les modules de ma formation (US-FORM-04)' })
  @ApiResponse({
    status: 200,
    description: 'Modules dans le nouvel ordre ; audit MODULES_REORDONNES.',
  })
  @ApiResponse({ status: 400, description: 'Liste incomplète, doublon ou module étranger.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  reordonnerModules(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: ReorderModulesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue[]> {
    const u = this.exigerUtilisateur(req);
    return this.modulesService.reordonner(u.sub, formationId, dto.moduleIds, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch('modules/:moduleId')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({ summary: 'Renommer / décrire un module de ma formation (US-FORM-04)' })
  @ApiResponse({ status: 200, description: 'Module ; audit MODULE_MODIFIE.' })
  @ApiResponse({ status: 400, description: 'Titre invalide, champ inconnu.' })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable dans cette formation.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  modifierModule(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: UpdateModuleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModuleVue> {
    const u = this.exigerUtilisateur(req);
    return this.modulesService.modifier(u.sub, formationId, moduleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Delete('modules/:moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ formationId: 'formationId' })
  @ApiOperation({ summary: 'Supprimer un module vide de ma formation (US-FORM-04)' })
  @ApiResponse({
    status: 204,
    description: 'Supprimé, numérotation resserrée ; audit MODULE_SUPPRIME.',
  })
  @ApiResponse({ status: 403, description: 'Formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable dans cette formation.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou module portant une évaluation.',
  })
  async supprimerModule(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const u = this.exigerUtilisateur(req);
    await this.modulesService.supprimer(u.sub, formationId, moduleId, {
      adresseIp: req.ip ?? null,
    });
  }

  private exigerUtilisateur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return req.user;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
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
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { AjouterLienDto, ModifierRessourceDto, ReordonnerRessourcesDto } from './ressources.dto';
import { RessourcesService, RessourceVue } from './ressources.service';

/**
 * Ressources pédagogiques de module — côté FORMATEUR (US-FORM-05, révision
 * v1.5). Formateur affecté ou administrateur. Les apprenants inscrits les
 * reçoivent dans « Mon espace » (`GET /formations/:id/mon-espace`).
 */
@ApiBearerAuth('access-token')
@ApiTags('ressources')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class RessourcesController {
  constructor(private readonly ressourcesService: RessourcesService) {}

  @Get('modules/:moduleId/ressources')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Ressources d’un module, dans l’ordre d’affichage' })
  @ApiResponse({ status: 200, description: 'Liste ordonnée.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  lister(@Param('moduleId', ParseUUIDPipe) moduleId: string): Promise<RessourceVue[]> {
    return this.ressourcesService.listerDuModule(moduleId);
  }

  @Post('modules/:moduleId/ressources/liens')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({
    summary: 'Ajouter un lien au module (US-FORM-05)',
    description:
      'Adresse http(s) ; une vidéo YouTube ou Vimeo est reconnue (identifiant et moment de ' +
      'départ) et lue dans l’application ; tout autre lien s’ouvre dans un nouvel onglet.',
  })
  @ApiResponse({
    status: 201,
    description: 'Lien ajouté en dernière position ; audit RESSOURCE_AJOUTEE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Titre, adresse (non http(s), identifiants, vidéo sans identifiant) ou description invalide.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Formation archivée, ou 50 ressources déjà dans le module.',
  })
  ajouterLien(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: AjouterLienDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RessourceVue> {
    return this.ressourcesService.ajouterLien(this.acteur(req), moduleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Put('modules/:moduleId/ressources/ordre')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Réordonner les ressources du module (liste complète)' })
  @ApiResponse({
    status: 200,
    description: 'Nouvelle liste ordonnée ; audit RESSOURCES_REORDONNEES.',
  })
  @ApiResponse({ status: 400, description: 'Liste incomplète, en double ou étrangère au module.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  reordonner(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: ReordonnerRessourcesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RessourceVue[]> {
    return this.ressourcesService.reordonner(this.acteur(req), moduleId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch('ressources/:ressourceId')
  @FormateurDeLaFormation({ ressourceId: 'ressourceId' })
  @ApiOperation({ summary: 'Modifier le titre, l’adresse ou la description d’une ressource' })
  @ApiResponse({ status: 200, description: 'Ressource modifiée ; audit RESSOURCE_MODIFIEE.' })
  @ApiResponse({ status: 400, description: 'Aucun champ, ou champ invalide.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Ressource introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  modifier(
    @Param('ressourceId', ParseUUIDPipe) ressourceId: string,
    @Body() dto: ModifierRessourceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RessourceVue> {
    return this.ressourcesService.modifier(this.acteur(req), ressourceId, dto, {
      adresseIp: req.ip ?? null,
    });
  }

  @Delete('ressources/:ressourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ ressourceId: 'ressourceId' })
  @ApiOperation({ summary: 'Retirer une ressource du module' })
  @ApiResponse({ status: 204, description: 'Ressource retirée ; audit RESSOURCE_SUPPRIMEE.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant ou formateur non affecté (tracé).' })
  @ApiResponse({ status: 404, description: 'Ressource introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  async supprimer(
    @Param('ressourceId', ParseUUIDPipe) ressourceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.ressourcesService.supprimer(this.acteur(req), ressourceId, {
      adresseIp: req.ip ?? null,
    });
  }

  private acteur(req: AuthenticatedRequest): string {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return req.user.sub;
  }
}

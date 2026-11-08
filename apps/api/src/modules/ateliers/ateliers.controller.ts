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
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../formations/autorisation/formateur-de-la-formation.decorator';
import { AtelierDetailVue, AtelierResumeVue, AteliersService } from './ateliers.service';
import { CreateAtelierDto } from './dto/create-atelier.dto';
import { UpdateAtelierDto } from './dto/update-atelier.dto';

const REFUS_403 =
  'Rôle insuffisant (apprenant), ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).';

/**
 * Ateliers — côté FORMATEUR affecté et ADMINISTRATEUR (US-ATEL-01, DS-13
 * partie 1, UC3 Formateur). Même découpage que les QCM : création et liste
 * sous le module (`/modules/:moduleId/ateliers`), le reste sous l'atelier
 * (`/ateliers/:atelierId`). @FormateurDeLaFormation remonte à la formation et
 * vérifie l'affectation avant que la requête n'atteigne le service.
 *
 * La grille (US-ATEL-02) et la publication (US-ATEL-03) viendront s'ajouter
 * sous `/ateliers/:atelierId/...`.
 */
@ApiBearerAuth('access-token')
@ApiTags('ateliers')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class AteliersController {
  constructor(private readonly ateliersService: AteliersService) {}

  @Post('modules/:moduleId/ateliers')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({
    summary: 'Créer un atelier (brouillon) dans un module (US-ATEL-01)',
    description:
      'Titre, énoncé, compétences visées, date limite (future, horloge PostgreSQL), types de ' +
      'livrables (liste fermée d’extensions), taille maximale par fichier, nombre maximal de ' +
      'fichiers et tolérance de retard. La formation se déduit du module.',
  })
  @ApiResponse({
    status: 201,
    description: 'Atelier créé au statut BROUILLON ; audit ATELIER_CREE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Identifiant mal formé, champ invalide ou hors bornes, type de livrable non pris en charge, ' +
      'ou date limite déjà passée (rien n’est enregistré).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  creer(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateAtelierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AtelierDetailVue> {
    return this.ateliersService.creer(this.acteur(req).sub, moduleId, dto, this.contexte(req));
  }

  @Get('modules/:moduleId/ateliers')
  @FormateurDeLaFormation({ moduleId: 'moduleId' })
  @ApiOperation({ summary: 'Lister les ateliers d’un module, tous statuts (US-ATEL-01)' })
  @ApiResponse({ status: 200, description: 'Ateliers du module (sans leur énoncé).' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Module introuvable.' })
  lister(@Param('moduleId', ParseUUIDPipe) moduleId: string): Promise<AtelierResumeVue[]> {
    return this.ateliersService.listerDuModule(moduleId);
  }

  @Get('ateliers/:atelierId')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({ summary: 'Consulter la fiche complète d’un atelier (US-ATEL-01)' })
  @ApiResponse({ status: 200, description: 'Atelier, avec sa formation et son module.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  detail(@Param('atelierId', ParseUUIDPipe) atelierId: string): Promise<AtelierDetailVue> {
    return this.ateliersService.detail(atelierId);
  }

  @Patch('ateliers/:atelierId')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Modifier un atelier en brouillon (US-ATEL-01)',
    description:
      'Tous les champs de la création sont facultatifs ; `competencesVisees: null` les efface. ' +
      'Une nouvelle date limite doit être dans le futur. Un PATCH sans changement n’écrit rien.',
  })
  @ApiResponse({
    status: 200,
    description: 'Atelier modifié ; audit ATELIER_MODIFIE (avant/après).',
  })
  @ApiResponse({
    status: 400,
    description: 'Corps vide, champ invalide ou vidé, ou date limite déjà passée.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Atelier qui n’est plus en brouillon, ou formation archivée.',
  })
  modifier(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Body() dto: UpdateAtelierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AtelierDetailVue> {
    return this.ateliersService.modifier(this.acteur(req).sub, atelierId, dto, this.contexte(req));
  }

  @Delete('ateliers/:atelierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({ summary: 'Supprimer un atelier en brouillon (US-ATEL-01)' })
  @ApiResponse({ status: 204, description: 'Atelier supprimé ; audit ATELIER_SUPPRIME.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Atelier qui n’est plus en brouillon, ou formation archivée.',
  })
  async supprimer(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.ateliersService.supprimer(this.acteur(req).sub, atelierId, this.contexte(req));
  }

  private acteur(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }

  private contexte(req: AuthenticatedRequest): { adresseIp: string | null } {
    return { adresseIp: req.ip ?? null };
  }
}

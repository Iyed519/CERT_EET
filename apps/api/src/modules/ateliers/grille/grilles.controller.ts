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
import { Role } from '../../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { CreateCritereDto, UpdateCritereDto } from './dto/critere.dto';
import { CopierModeleDto, EnregistrerModeleDto, OrdreCriteresDto } from './dto/grille-actions.dto';
import { GrilleVue, GrillesService, ModeleVue } from './grilles.service';

const REFUS_403 =
  'Rôle insuffisant (apprenant), ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).';
const REFUS_409 =
  'Atelier qui n’est plus en brouillon (la grille est figée), ou formation archivée.';
const GRILLE_200 = 'La grille à jour : critères, niveaux, total des pondérations, validée ou non.';

/**
 * Grille de notation pondérée d'un atelier (US-ATEL-02, DS-13 partie 2,
 * UC4 Formateur) et modèles réutilisables.
 *
 * Écart assumé avec DS-13 (`/grilles/:grilleId/...`) : la grille vit SOUS
 * l'atelier (`/ateliers/:atelierId/grille/...`), comme l'atelier vit sous
 * son module. Une grille par atelier : l'URL suffit à la désigner, et
 * @FormateurDeLaFormation({ atelierId }) vérifie l'affectation avant le
 * service. Les modèles, sans atelier, sont sous `/grilles/modeles` ; leur
 * propriétaire est vérifié par le service.
 */
@ApiBearerAuth('access-token')
@ApiTags('grilles')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class GrillesController {
  constructor(private readonly grillesService: GrillesService) {}

  @Get('ateliers/:atelierId/grille')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Consulter la grille de notation d’un atelier (US-ATEL-02)',
    description:
      'N’écrit jamais : tant qu’aucun critère n’a été ajouté, la grille est vide (`id: null`).',
  })
  @ApiResponse({ status: 200, description: GRILLE_200 })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  lire(@Param('atelierId', ParseUUIDPipe) atelierId: string): Promise<GrilleVue> {
    return this.grillesService.lire(atelierId);
  }

  @Post('ateliers/:atelierId/grille/criteres')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Ajouter un critère pondéré (US-ATEL-02)',
    description:
      'Intitulé, pondération entière (1–100 %), description, 4 niveaux (Insuffisant, ' +
      'Acceptable, Bon, Excellent) aux plages contiguës de 0 à 100 % — par défaut ' +
      '0–25 / 25–50 / 50–75 / 75–100. Le total des pondérations doit rester ≤ 100 %. ' +
      'Une grille validée redevient non validée.',
  })
  @ApiResponse({ status: 201, description: `${GRILLE_200} Audit GRILLE_CRITERE_AJOUTE.` })
  @ApiResponse({
    status: 400,
    description:
      'Champ invalide, plages de niveaux incohérentes, plus de 20 critères, ou total des ' +
      'pondérations au-delà de 100 % (« Total des pondérations : X % (au-delà de 100 %) »).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({ status: 409, description: REFUS_409 })
  ajouterCritere(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Body() dto: CreateCritereDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.ajouterCritere(this.acteur(req), atelierId, dto, this.contexte(req));
  }

  @Put('ateliers/:atelierId/grille/criteres/ordre')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Réordonner les critères (US-ATEL-02)',
    description:
      'Liste COMPLÈTE des critères dans l’ordre voulu. L’ordre n’entre pas dans la note : ' +
      'la validation est conservée.',
  })
  @ApiResponse({ status: 200, description: `${GRILLE_200} Audit GRILLE_CRITERES_REORDONNES.` })
  @ApiResponse({
    status: 400,
    description: 'Liste qui ne cite pas chaque critère de la grille exactement une fois.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({ status: 409, description: REFUS_409 })
  reordonner(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Body() dto: OrdreCriteresDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.reordonner(this.acteur(req), atelierId, dto, this.contexte(req));
  }

  @Patch('ateliers/:atelierId/grille/criteres/:critereId')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Modifier un critère (US-ATEL-02)',
    description:
      'Champs facultatifs ; `description: null` l’efface ; `niveaux` remplace les 4 niveaux. ' +
      'Une modification réelle retire la validation ; sans effet, rien n’est écrit.',
  })
  @ApiResponse({
    status: 200,
    description: `${GRILLE_200} Audit GRILLE_CRITERE_MODIFIE (avant/après).`,
  })
  @ApiResponse({
    status: 400,
    description:
      'Corps vide, champ invalide ou vidé, plages incohérentes, ou total au-delà de 100 %.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({
    status: 404,
    description: 'Atelier introuvable, ou critère hors de cette grille.',
  })
  @ApiResponse({ status: 409, description: REFUS_409 })
  modifierCritere(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Param('critereId', ParseUUIDPipe) critereId: string,
    @Body() dto: UpdateCritereDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.modifierCritere(
      this.acteur(req),
      atelierId,
      critereId,
      dto,
      this.contexte(req),
    );
  }

  @Delete('ateliers/:atelierId/grille/criteres/:critereId')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Supprimer un critère (US-ATEL-02)',
    description: 'Renvoie la grille à jour (rangs resserrés) ; la validation est retirée.',
  })
  @ApiResponse({ status: 200, description: `${GRILLE_200} Audit GRILLE_CRITERE_SUPPRIME.` })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({
    status: 404,
    description: 'Atelier introuvable, ou critère hors de cette grille.',
  })
  @ApiResponse({ status: 409, description: REFUS_409 })
  supprimerCritere(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Param('critereId', ParseUUIDPipe) critereId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.supprimerCritere(
      this.acteur(req),
      atelierId,
      critereId,
      this.contexte(req),
    );
  }

  @Post('ateliers/:atelierId/grille/valider')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Valider la grille : total exactement 100 % (US-ATEL-02)',
    description:
      'Prérequis de la publication (US-ATEL-03). Déjà validée : 200 sans nouvelle trace.',
  })
  @ApiResponse({ status: 200, description: `${GRILLE_200} Audit GRILLE_VALIDEE.` })
  @ApiResponse({
    status: 400,
    description:
      'Aucun critère ou total ≠ 100 % (« Total des pondérations = X % (doit être 100 %) »).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({ status: 409, description: REFUS_409 })
  valider(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.valider(this.acteur(req), atelierId, this.contexte(req));
  }

  @Post('ateliers/:atelierId/grille/modele')
  @HttpCode(HttpStatus.CREATED)
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Enregistrer une copie de la grille comme modèle réutilisable (US-ATEL-02)',
    description:
      'Le modèle appartient à l’acteur et survit à l’atelier. Seule une grille complète ' +
      '(100 %) devient un modèle. Permis quel que soit le statut de l’atelier.',
  })
  @ApiResponse({ status: 201, description: 'Modèle créé ; audit GRILLE_MODELE_ENREGISTRE.' })
  @ApiResponse({
    status: 400,
    description: 'Nom invalide (3–120 caractères), ou grille incomplète (≠ 100 %).',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  @ApiResponse({ status: 409, description: 'Vous avez déjà un modèle de ce nom.' })
  enregistrerModele(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Body() dto: EnregistrerModeleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ModeleVue> {
    return this.grillesService.enregistrerModele(
      this.acteur(req),
      atelierId,
      dto,
      this.contexte(req),
    );
  }

  @Post('ateliers/:atelierId/grille/copier')
  @HttpCode(HttpStatus.OK)
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Partir d’un modèle : remplace la grille par une copie (US-ATEL-02)',
    description:
      'Copie profonde (critères + niveaux), indépendante du modèle, NON validée. Les critères ' +
      'existants de la grille sont remplacés.',
  })
  @ApiResponse({ status: 200, description: `${GRILLE_200} Audit GRILLE_MODELE_COPIE.` })
  @ApiResponse({ status: 400, description: 'modeleId mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({
    status: 404,
    description: 'Atelier introuvable, ou modèle inconnu / appartenant à un autre formateur.',
  })
  @ApiResponse({ status: 409, description: REFUS_409 })
  copierModele(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Body() dto: CopierModeleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GrilleVue> {
    return this.grillesService.copierModele(this.acteur(req), atelierId, dto, this.contexte(req));
  }

  @Get('grilles/modeles')
  @ApiOperation({
    summary: 'Lister mes modèles de grille (administrateur : tous) (US-ATEL-02)',
    description: 'Par nom ; chaque modèle avec ses critères (intitulé, pondération).',
  })
  @ApiResponse({ status: 200, description: 'Modèles visibles par l’acteur.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (apprenant).' })
  listerModeles(@Req() req: AuthenticatedRequest): Promise<ModeleVue[]> {
    return this.grillesService.listerModeles(this.acteur(req));
  }

  @Delete('grilles/modeles/:modeleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer un de mes modèles (US-ATEL-02)',
    description: 'Les grilles déjà copiées depuis ce modèle n’en dépendent pas.',
  })
  @ApiResponse({ status: 204, description: 'Modèle supprimé ; audit GRILLE_MODELE_SUPPRIME.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (apprenant).' })
  @ApiResponse({
    status: 404,
    description: 'Modèle inconnu, ou appartenant à un autre formateur.',
  })
  async supprimerModele(
    @Param('modeleId', ParseUUIDPipe) modeleId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.grillesService.supprimerModele(this.acteur(req), modeleId, this.contexte(req));
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

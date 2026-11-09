import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FormateurDeLaFormation } from '../../formations/autorisation/formateur-de-la-formation.decorator';
import { FiltreLivrablesDto, NoterCritereDto } from './correction.dto';
import {
  CorrectionsService,
  LivrableCorrectionVue,
  LivrableResumeVue,
  NoteEnregistreeVue,
} from './corrections.service';

const REFUS_403 =
  'Rôle insuffisant (apprenant), ou formateur non affecté à la formation (audit ACCES_RESSOURCE_REFUSE).';

/**
 * Correction des livrables — côté FORMATEUR affecté et ADMINISTRATEUR
 * (US-ATEL-06, DS-03 partie 2, UC5 Formateur).
 *
 * Écart assumé avec DS-03 (`PATCH /corrections/:correctionId/critere`) : la
 * note d'un critère est rangée SOUS LE LIVRABLE, comme l'ouverture, pour que
 * @FormateurDeLaFormation({ livrableId }) remonte livrable -> atelier ->
 * module -> formation avant que la requête n'atteigne le service.
 */
@ApiBearerAuth('access-token')
@ApiTags('ateliers')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller()
export class CorrectionsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Get('ateliers/:atelierId/livrables')
  @FormateurDeLaFormation({ atelierId: 'atelierId' })
  @ApiOperation({
    summary: 'Lister les livrables d’un atelier (US-ATEL-06)',
    description:
      'Premier déposé en tête ; filtre facultatif `statut` (SOUMIS, EN_CORRECTION, NOTE). ' +
      'Chaque ligne donne l’apprenant, la date, le retard, la version et l’avancement de la ' +
      'correction (null tant qu’elle n’est pas ouverte).',
  })
  @ApiResponse({ status: 200, description: 'Livrables de l’atelier.' })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé ou statut inconnu.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Atelier introuvable.' })
  lister(
    @Param('atelierId', ParseUUIDPipe) atelierId: string,
    @Query() filtre: FiltreLivrablesDto,
  ): Promise<LivrableResumeVue[]> {
    return this.correctionsService.listerDeLAtelier(atelierId, filtre.statut);
  }

  @Get('livrables/:livrableId')
  @FormateurDeLaFormation({ livrableId: 'livrableId' })
  @ApiOperation({
    summary: 'Consulter un livrable à corriger, sa grille et sa correction (US-ATEL-06)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Livrable (fichiers, commentaire, liens, hash), critères de la grille et correction ' +
      '(notes, score pondéré, avancement ; null si elle n’est pas ouverte).',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Livrable introuvable.' })
  detail(@Param('livrableId', ParseUUIDPipe) livrableId: string): Promise<LivrableCorrectionVue> {
    return this.correctionsService.detail(livrableId);
  }

  @Patch('livrables/:livrableId/ouvrir')
  @FormateurDeLaFormation({ livrableId: 'livrableId' })
  @ApiOperation({
    summary: 'Ouvrir la correction d’un livrable (US-ATEL-06)',
    description:
      'Sous le verrou de la ligne du livrable : SOUMIS -> EN_CORRECTION et création de la ' +
      'correction. L’apprenant ne peut plus agir sur son livrable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Correction ouverte ; audit CORRECTION_OUVERTE.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Livrable introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Livrable déjà en correction ou déjà noté, ou formation archivée.',
  })
  ouvrir(
    @Param('livrableId', ParseUUIDPipe) livrableId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LivrableCorrectionVue> {
    return this.correctionsService.ouvrir(this.acteur(req), livrableId, this.contexte(req));
  }

  @Put('livrables/:livrableId/correction/criteres/:critereId')
  @FormateurDeLaFormation({ livrableId: 'livrableId' })
  @ApiOperation({
    summary: 'Noter un critère : niveau, points dans sa plage, commentaire (US-ATEL-06)',
    description:
      'Crée ou remplace la note du critère (brouillon). Les points sont en % du critère et ' +
      'doivent tomber dans la plage du niveau choisi. La réponse donne le score pondéré ' +
      'recalculé (Σ points × pondération / 100, sur 100) et l’avancement.',
  })
  @ApiResponse({
    status: 200,
    description: 'Note enregistrée ; audit NOTE_CRITERE_ENREGISTREE (avant/après).',
  })
  @ApiResponse({
    status: 400,
    description:
      'Identifiant mal formé, niveau hors 1–4, points hors 0–100 ou hors de la plage du ' +
      'niveau, plus de deux décimales, commentaire trop long.',
  })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({
    status: 404,
    description: 'Livrable introuvable, ou critère étranger à la grille de son atelier.',
  })
  @ApiResponse({
    status: 409,
    description: 'Correction pas encore ouverte, livrable déjà noté, ou formation archivée.',
  })
  noter(
    @Param('livrableId', ParseUUIDPipe) livrableId: string,
    @Param('critereId', ParseUUIDPipe) critereId: string,
    @Body() dto: NoterCritereDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NoteEnregistreeVue> {
    return this.correctionsService.noterCritere(
      this.acteur(req),
      livrableId,
      critereId,
      dto,
      this.contexte(req),
    );
  }

  @Get('livrables/:livrableId/fichiers/:ordre')
  @FormateurDeLaFormation({ livrableId: 'livrableId' })
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    summary: 'Télécharger un fichier du livrable (US-ATEL-06)',
    description:
      'Le contenu est relayé en flux depuis le stockage, en pièce jointe, avec son nom ' +
      'd’origine. Le SHA-256 du fichier figure dans la fiche du livrable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contenu du fichier ; audit LIVRABLE_FICHIER_TELECHARGE.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant ou rang mal formé.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: REFUS_403 })
  @ApiResponse({ status: 404, description: 'Livrable ou fichier introuvable.' })
  @ApiResponse({ status: 503, description: 'Stockage des fichiers indisponible.' })
  async telecharger(
    @Param('livrableId', ParseUUIDPipe) livrableId: string,
    @Param('ordre', ParseIntPipe) ordre: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const fichier = await this.correctionsService.telechargerFichier(
      this.acteur(req),
      livrableId,
      ordre,
      this.contexte(req),
    );
    return new StreamableFile(fichier.flux, {
      type: 'application/octet-stream',
      length: fichier.taille,
      disposition: dispositionPieceJointe(fichier.nomOriginal),
    });
  }

  private acteur(req: AuthenticatedRequest): string {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user.sub;
  }

  private contexte(req: AuthenticatedRequest): { adresseIp: string | null } {
    return { adresseIp: req.ip ?? null };
  }
}

/**
 * En-tête Content-Disposition d'une pièce jointe : un nom ASCII de repli
 * (accents et guillemets remplacés) et le vrai nom encodé en UTF-8 (RFC 5987).
 */
export function dispositionPieceJointe(nom: string): string {
  const repli = nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${repli}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}

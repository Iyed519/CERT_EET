import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AffecterFormateurDto } from './dto/affecter-formateur.dto';
import { FormateurAffecteVue, FormationFormateursService } from './formation-formateurs.service';

/**
 * Affectation des formateurs à une formation — côté ADMINISTRATEUR
 * (US-FORM-03, DS-16 P1).
 *
 * Routes imbriquées sous la formation, comme les modules : l'URL porte
 * toujours la formation concernée. @Roles au niveau CLASSE : un formateur ne
 * peut ni s'affecter lui-même, ni voir qui est affecté par cette route.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/formations/:formationId/formateurs')
export class AdminFormationFormateursController {
  constructor(private readonly formateursService: FormationFormateursService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Affecter un formateur à la formation (US-FORM-03)' })
  @ApiResponse({
    status: 201,
    description: 'Formateur affecté et prévenu par email ; audit FORMATEUR_AFFECTE.',
  })
  @ApiResponse({
    status: 400,
    description: 'Identifiant invalide, compte sans le rôle Formateur ou compte non actif.',
  })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation ou utilisateur introuvable.' })
  @ApiResponse({ status: 409, description: 'Formateur déjà affecté, ou formation archivée.' })
  async affecter(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Body() dto: AffecterFormateurDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormateurAffecteVue> {
    const admin = this.exigerAdmin(req);
    return this.formateursService.affecter(admin.sub, formationId, dto.formateurId, {
      adresseIp: req.ip ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Lister les formateurs affectés à la formation (US-FORM-03)' })
  @ApiResponse({
    status: 200,
    description: 'Formateurs affectés, du plus ancien au plus récent, avec rôle et statut actuels.',
  })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  lister(@Param('formationId', ParseUUIDPipe) formationId: string): Promise<FormateurAffecteVue[]> {
    return this.formateursService.lister(formationId);
  }

  @Delete(':formateurId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un formateur de la formation (US-FORM-03)' })
  @ApiResponse({ status: 204, description: 'Affectation retirée ; audit FORMATEUR_RETIRE.' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  @ApiResponse({
    status: 404,
    description: 'Formation introuvable, ou formateur non affecté à cette formation.',
  })
  @ApiResponse({ status: 409, description: 'Formation archivée.' })
  async retirer(
    @Param('formationId', ParseUUIDPipe) formationId: string,
    @Param('formateurId', ParseUUIDPipe) formateurId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const admin = this.exigerAdmin(req);
    await this.formateursService.retirer(admin.sub, formationId, formateurId, {
      adresseIp: req.ip ?? null,
    });
  }

  /** Filet : le JwtAuthGuard garantit déjà req.user, mais le typage l'ignore. */
  private exigerAdmin(req: AuthenticatedRequest): AccessTokenPayload {
    if (!req.user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return req.user;
  }
}

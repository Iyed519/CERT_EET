import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreerDemandeAffectationDto,
  ListerDemandesAffectationDto,
  RefuserDemandeAffectationDto,
} from './demandes-affectation.dto';
import {
  DemandeAffectationAdminVue,
  DemandeAffectationPage,
  DemandeAffectationVue,
  DemandesAffectationService,
  FormationDisponible,
} from './demandes-affectation.service';

function utilisateur(req: AuthenticatedRequest): string {
  if (!req.user) throw new UnauthorizedException();
  return req.user.sub;
}

/** US-FORM-07 — Côté formateur : demander, suivre, annuler. */
@ApiBearerAuth('access-token')
@ApiTags('formations')
@Roles(Role.FORMATEUR)
@Controller('formateur/demandes-affectation')
export class DemandesAffectationFormateurController {
  constructor(private readonly service: DemandesAffectationService) {}

  @Get()
  @ApiOperation({ summary: 'Mes demandes d’affectation, la plus récente d’abord (US-FORM-07)' })
  mes(@Req() req: AuthenticatedRequest): Promise<DemandeAffectationVue[]> {
    return this.service.mesDemandes(utilisateur(req));
  }

  @Get('formations-disponibles')
  @ApiOperation({ summary: 'Formations non archivées où je ne suis pas affecté (US-FORM-07)' })
  disponibles(@Req() req: AuthenticatedRequest): Promise<FormationDisponible[]> {
    return this.service.formationsDisponibles(utilisateur(req));
  }

  @Post()
  @ApiOperation({ summary: 'Demander à enseigner une formation existante (US-FORM-07)' })
  @ApiResponse({ status: 201, description: 'Demande enregistrée (EN_ATTENTE).' })
  @ApiResponse({ status: 400, description: 'Motif hors 10–1000 caractères, formation archivée.' })
  @ApiResponse({ status: 404, description: 'Formation introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà affecté, ou demande déjà en attente.' })
  creer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreerDemandeAffectationDto,
  ): Promise<DemandeAffectationVue> {
    return this.service.creer(utilisateur(req), dto.formationId, dto.motif, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch(':id/annuler')
  @HttpCode(200)
  @ApiOperation({ summary: 'Annuler une de mes demandes en attente (US-FORM-07)' })
  @ApiResponse({ status: 404, description: 'Introuvable (ou demande d’un autre).' })
  @ApiResponse({ status: 409, description: 'Déjà traitée.' })
  annuler(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DemandeAffectationVue> {
    return this.service.annuler(utilisateur(req), id, { adresseIp: req.ip ?? null });
  }
}

/** US-FORM-07 — Côté administrateur : liste filtrable, accepter, refuser. */
@ApiBearerAuth('access-token')
@ApiTags('formations')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/demandes-affectation')
export class DemandesAffectationAdminController {
  constructor(private readonly service: DemandesAffectationService) {}

  @Get()
  @ApiOperation({ summary: 'Demandes d’affectation, filtrables par statut, paginées (US-FORM-07)' })
  lister(@Query() q: ListerDemandesAffectationDto): Promise<DemandeAffectationPage> {
    return this.service.lister(q);
  }

  @Patch(':id/accepter')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter : crée l’affectation dans la même transaction (US-FORM-07)' })
  @ApiResponse({ status: 404, description: 'Introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà traitée, formation archivée, ou formateur inactif.' })
  accepter(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DemandeAffectationAdminVue> {
    return this.service.accepter(utilisateur(req), id, { adresseIp: req.ip ?? null });
  }

  @Patch(':id/refuser')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuser avec un motif obligatoire (US-FORM-07)' })
  @ApiResponse({ status: 400, description: 'Motif hors 10–1000 caractères.' })
  @ApiResponse({ status: 404, description: 'Introuvable.' })
  @ApiResponse({ status: 409, description: 'Déjà traitée.' })
  refuser(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuserDemandeAffectationDto,
  ): Promise<DemandeAffectationAdminVue> {
    return this.service.refuser(utilisateur(req), id, dto.motif, { adresseIp: req.ip ?? null });
  }
}

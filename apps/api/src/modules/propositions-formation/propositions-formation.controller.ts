import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CommentairePropositionDto,
  ListerPropositionsDto,
  PropositionFormationDto,
} from './propositions-formation.dto';
import {
  PropositionAdminVue,
  PropositionPage,
  PropositionVue,
  PropositionsFormationService,
} from './propositions-formation.service';

function utilisateur(req: AuthenticatedRequest): string {
  if (!req.user) throw new UnauthorizedException();
  return req.user.sub;
}

/** US-FORM-08 — Côté formateur : proposer, suivre, modifier et resoumettre. */
@ApiBearerAuth('access-token')
@ApiTags('formations')
@Roles(Role.FORMATEUR)
@Controller('formateur/propositions-formation')
export class PropositionsFormateurController {
  constructor(private readonly service: PropositionsFormationService) {}

  @Get()
  @ApiOperation({ summary: 'Mes propositions de formation (US-FORM-08)' })
  mes(@Req() req: AuthenticatedRequest): Promise<PropositionVue[]> {
    return this.service.mesPropositions(utilisateur(req));
  }

  @Post()
  @ApiOperation({ summary: 'Proposer une nouvelle formation (US-FORM-08)' })
  @ApiResponse({ status: 201, description: 'Proposition enregistrée (EN_ATTENTE).' })
  @ApiResponse({ status: 400, description: 'Champ invalide (mêmes règles que US-FORM-01), motif hors 10–1000.' })
  @ApiResponse({ status: 409, description: 'Déjà 5 propositions en cours.' })
  creer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PropositionFormationDto,
  ): Promise<PropositionVue> {
    return this.service.creer(utilisateur(req), dto, { adresseIp: req.ip ?? null });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier et resoumettre une proposition en cours (US-FORM-08)' })
  @ApiResponse({ status: 404, description: 'Introuvable (ou proposition d’un autre).' })
  @ApiResponse({ status: 409, description: 'Déjà acceptée ou refusée.' })
  modifier(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PropositionFormationDto,
  ): Promise<PropositionVue> {
    return this.service.modifier(utilisateur(req), id, dto, { adresseIp: req.ip ?? null });
  }
}

/** US-FORM-08 — Côté administrateur : liste, accepter, demander des modifications, refuser. */
@ApiBearerAuth('access-token')
@ApiTags('formations')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/propositions-formation')
export class PropositionsAdminController {
  constructor(private readonly service: PropositionsFormationService) {}

  @Get()
  @ApiOperation({ summary: 'Propositions de formation, filtrables par statut (US-FORM-08)' })
  lister(@Query() q: ListerPropositionsDto): Promise<PropositionPage> {
    return this.service.lister(q);
  }

  @Patch(':id/accepter')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter : formation BROUILLON créée, proposant affecté (US-FORM-08)' })
  @ApiResponse({ status: 409, description: 'N’attend pas de décision, ou formateur inactif.' })
  accepter(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PropositionAdminVue> {
    return this.service.accepter(utilisateur(req), id, { adresseIp: req.ip ?? null });
  }

  @Patch(':id/demander-modifications')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demander des modifications avec un commentaire (US-FORM-08)' })
  demanderModifications(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentairePropositionDto,
  ): Promise<PropositionAdminVue> {
    return this.service.demanderModifications(utilisateur(req), id, dto.commentaire, {
      adresseIp: req.ip ?? null,
    });
  }

  @Patch(':id/refuser')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuser avec un motif obligatoire (US-FORM-08)' })
  refuser(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentairePropositionDto,
  ): Promise<PropositionAdminVue> {
    return this.service.refuser(utilisateur(req), id, dto.commentaire, { adresseIp: req.ip ?? null });
  }
}

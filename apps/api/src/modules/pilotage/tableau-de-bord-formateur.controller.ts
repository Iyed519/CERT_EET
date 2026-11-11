import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { PeriodeQueryDto } from './periode.dto';
import {
  TableauDeBordFormateur,
  TableauDeBordFormateurService,
} from './tableau-de-bord-formateur.service';

/** US-DASH-03 — Tableau de bord global du formateur (ses formations seulement). */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Roles(Role.FORMATEUR)
@Controller('formateur/tableau-de-bord')
export class TableauDeBordFormateurController {
  constructor(private readonly tableauDeBord: TableauDeBordFormateurService) {}

  @Get()
  @ApiOperation({
    summary: 'Tableau de bord global du formateur (US-DASH-03)',
    description:
      'Indicateurs agrégés sur TOUTES les formations où le formateur est affecté : formations ' +
      'par statut, inscrits et actifs, taux de réussite et score moyen QCM, tentatives et ' +
      'livrables à évaluer, alertes de décrochage ouvertes, certificats délivrés, activité ' +
      'quotidienne et une ligne par formation. Période `du`–`au` (jours inclus, Tunis ; ' +
      '30 derniers jours par défaut, 366 au plus). Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Indicateurs.' })
  @ApiResponse({ status: 400, description: 'Date invalide, période inversée ou trop longue.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre que formateur.' })
  global(
    @Req() req: AuthenticatedRequest,
    @Query() q: PeriodeQueryDto,
  ): Promise<TableauDeBordFormateur> {
    if (!req.user) throw new UnauthorizedException();
    return this.tableauDeBord.pour(req.user.sub, q.du, q.au);
  }
}

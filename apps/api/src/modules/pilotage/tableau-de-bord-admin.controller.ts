import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../database/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { PeriodeQueryDto } from './periode.dto';
import { TableauDeBordGlobal, TableauDeBordService } from './tableau-de-bord.service';

/** US-DASH-01 — Tableau de bord global de la plateforme (ADMINISTRATEUR, DS-16 P2). */
@ApiBearerAuth('access-token')
@ApiTags('pilotage')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/tableau-de-bord')
export class TableauDeBordAdminController {
  constructor(private readonly tableauDeBord: TableauDeBordService) {}

  @Get()
  @ApiOperation({
    summary: 'Tableau de bord global (US-DASH-01, DS-16 P2)',
    description:
      'Indicateurs agrégés : utilisateurs par rôle et statut, formations, inscriptions, ' +
      'évaluations (QCM, ateliers), certificats (émis, révoqués, consultations), activité ' +
      'quotidienne, activité récente et alertes système. Période `du`–`au` (jours inclus, ' +
      'Tunis ; 30 derniers jours par défaut, 366 au plus). Période vide = zéros. Lecture seule.',
  })
  @ApiResponse({ status: 200, description: 'Indicateurs.' })
  @ApiResponse({ status: 400, description: 'Date invalide, période inversée ou trop longue.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({ status: 403, description: 'Rôle autre qu’administrateur.' })
  global(@Query() q: PeriodeQueryDto): Promise<TableauDeBordGlobal> {
    return this.tableauDeBord.global(q.du, q.au);
  }
}

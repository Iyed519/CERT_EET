import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../database/enums/role.enum';
import { Audit } from './decorators/audit.decorator';
import { AuditPage, AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { auditLogsToCsv } from './audit-csv.util';

/**
 * Consultation + export du journal d'audit (US-AUTH-12, DS-16 partie 5).
 *
 * @Roles(ADMINISTRATEUR) au niveau CLASSE : le RolesGuard global refuse tout
 * autre rôle en 403 ; le JwtAuthGuard global exige déjà une session valide
 * (aucune route @Public). LECTURE SEULE : aucune route UPDATE/DELETE n'existe
 * sur les audit logs (immuabilité NF3, doublée du trigger BDD).
 *
 * @Audit(...) : consulter ET exporter le journal sont elles-mêmes des actions
 * sensibles, non journalisées ailleurs -> l'AuditInterceptor les trace (acteur
 * = admin, résultat selon statut). Ce sont les seules routes annotées @Audit,
 * donc aucun risque de double-log avec les écritures fines des services.
 */
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Audit('AUDIT_CONSULTE')
  @ApiOperation({ summary: "Consulter le journal d'audit (US-AUTH-12, DS-16)" })
  @ApiResponse({
    status: 200,
    description:
      'Entrées paginées { items, total, page, limit }, tri horodatage DESC.',
  })
  @ApiResponse({ status: 400, description: 'Filtres invalides (UUID, date…).' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  list(@Query() query: AuditQueryDto): Promise<AuditPage> {
    return this.auditService.list(query);
  }

  /**
   * US-AUTH-12 (extension) — Export CSV du journal.
   *
   * MÊMES filtres que la consultation (action, userId, période) : sans filtre
   * on télécharge tout le journal, avec filtres on télécharge exactement le
   * résultat de la recherche (page/limit ignorés — on exporte l'ensemble, pas
   * une page). Réponse en pièce jointe `text/csv` (BOM UTF-8 pour Excel).
   *
   * @Audit('AUDIT_EXPORTE') : télécharger le journal est une action sensible,
   * elle-même tracée par l'AuditInterceptor.
   *
   * @Res({ passthrough: true }) : je pose moi-même les en-têtes de
   * téléchargement, mais je laisse Nest envoyer le corps (renvoyé) et gérer le
   * cycle de vie -> l'AuditInterceptor voit toujours le succès/échec.
   */
  @Get('export')
  @Audit('AUDIT_EXPORTE')
  @ApiOperation({
    summary: "Exporter le journal d'audit en CSV (US-AUTH-12, DS-16)",
  })
  @ApiResponse({
    status: 200,
    description: 'Fichier CSV (toutes les lignes filtrées).',
  })
  @ApiResponse({ status: 400, description: 'Filtres invalides (UUID, date…).' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant (non-admin).' })
  async export(
    @Query() query: AuditQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const lignes = await this.auditService.export(query);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-logs-${stamp}.csv"`,
    );
    // BOM UTF-8 (﻿) : Excel lit alors correctement les accents (Succès…).
    return '﻿' + auditLogsToCsv(lignes);
  }
}

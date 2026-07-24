import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomaineEtudes } from '../../database/entities/domaine-etudes.entity';
import {
  EtablissementVue,
  ReferentielService,
} from './referentiel.service';
/**
 * Référentiel (US-AUTH-15). Routes PROTÉGÉES (JwtAuthGuard global) : seul un
 * utilisateur connecté, en train de compléter son profil, en a besoin.
 */
@ApiTags('referentiel')
@Controller('referentiel')
export class ReferentielController {
  constructor(private readonly referentielService: ReferentielService) {}
  @Get('domaines')
  @ApiOperation({ summary: "Liste des domaines d'études (US-AUTH-15)" })
  @ApiResponse({ status: 200, description: 'Domaines triés par intitulé.' })
  getDomaines(): Promise<DomaineEtudes[]> {
    return this.referentielService.getDomaines();
  }
  @Get('etablissements')
  @ApiOperation({ summary: 'Liste des établissements (US-AUTH-15)' })
  @ApiResponse({
    status: 200,
    description: 'Établissements (avec université), triés par nom.',
  })
  getEtablissements(): Promise<EtablissementVue[]> {
    return this.referentielService.getEtablissements();
  }
}

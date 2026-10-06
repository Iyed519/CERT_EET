import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ListFormationsDto } from './dto/list-formations.dto';
import {
  FormationDetailVue,
  FormationPage,
  FormationsService,
} from './formations.service';

/**
 * Consultation des formations (US-FORM-01, DS-08 étape 1).
 *
 * AUCUN @Roles ici : ces routes sont ouvertes à TOUT utilisateur authentifié
 * (le JwtAuthGuard global exige une session valide -> 401 sans token). Ce que
 * chacun VOIT dépend de son rôle, et c'est le service qui l'applique :
 * l'administrateur voit tout, les autres voient le catalogue (OUVERTE).
 */
@ApiBearerAuth('access-token')
@ApiTags('formations')
@Controller('formations')
export class FormationsController {
  constructor(private readonly formationsService: FormationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les formations (US-FORM-01)' })
  @ApiResponse({
    status: 200,
    description:
      'Formations paginées { items, total, page, limit }, tri DESC. Non-admin : catalogue OUVERTE.',
  })
  @ApiResponse({ status: 400, description: 'Filtre invalide (statut, page…).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 403,
    description: 'Filtre sur un statut autre que OUVERTE demandé par un non-admin.',
  })
  async lister(
    @Query() query: ListFormationsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationPage> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.formationsService.lister({ role: user.role }, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter une formation et ses modules (US-FORM-01)' })
  @ApiResponse({
    status: 200,
    description: 'Formation + modules triés par ordre.',
  })
  @ApiResponse({ status: 400, description: 'Identifiant mal formé (UUID attendu).' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  @ApiResponse({
    status: 404,
    description: 'Formation introuvable (ou non ouverte, pour un non-admin).',
  })
  async consulter(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormationDetailVue> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Non authentifié.');
    }
    return this.formationsService.consulter({ role: user.role }, id);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../../database/enums/role.enum';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { AnonymiserCompteDto } from './anonymisation.dto';
import { AnonymisationService, AnonymisationVue } from './anonymisation.service';

/** US-CPT-04 — Anonymisation RGPD d'un compte (administrateur seulement). */
@ApiBearerAuth('access-token')
@ApiTags('admin')
@Roles(Role.ADMINISTRATEUR)
@Controller('admin/users')
export class AnonymisationController {
  constructor(private readonly service: AnonymisationService) {}

  @Post(':id/anonymiser')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anonymiser un compte — irréversible (US-CPT-04)' })
  @ApiResponse({ status: 200, description: 'Compte anonymisé ; sessions révoquées.' })
  @ApiResponse({ status: 400, description: 'Confirmation absente ou incorrecte.' })
  @ApiResponse({ status: 401, description: 'Mot de passe administrateur invalide.' })
  @ApiResponse({
    status: 403,
    description: 'Rôle insuffisant, son propre compte, ou dernier administrateur actif.',
  })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  @ApiResponse({ status: 409, description: 'Compte déjà anonymisé.' })
  anonymiser(
    @Param('id', ParseUUIDPipe) cibleId: string,
    @Body() dto: AnonymiserCompteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AnonymisationVue> {
    if (!req.user) throw new UnauthorizedException('Non authentifié.');
    return this.service.anonymiser(req.user.sub, cibleId, dto.motDePasseAdmin, {
      adresseIp: req.ip ?? null,
    });
  }
}

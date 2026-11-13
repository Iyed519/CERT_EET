import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmConfig } from '../../../config/configuration';
import { Role } from '../../../database/enums/role.enum';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MESSAGE_IA_NON_CONFIGUREE } from './llm-non-configure';

export const MESSAGE_IA_DEMONSTRATION =
  'Mode démonstration : l’IA n’est pas branchée (LLM_FOURNISSEUR=factice), les questions sont des exemples fixes. Ajoutez ANTHROPIC_API_KEY dans le fichier .env pour utiliser Claude.';

/** US-IA-09 — État du fournisseur d'IA, sans aucun secret. */
export interface EtatIa {
  fournisseur: LlmConfig['fournisseur'];
  modele: string;
  /** Vrai si un vrai modèle est appelé (Anthropic ou compatible OpenAI). */
  reel: boolean;
  /** Ce qu'il faut savoir ou faire ; null quand l'IA réelle est branchée. */
  message: string | null;
}

export function etatIa(config: LlmConfig): EtatIa {
  const reel = config.fournisseur === 'anthropic' || config.fournisseur === 'compatible-openai';
  return {
    fournisseur: config.fournisseur,
    modele: reel ? config.modele : config.fournisseur,
    reel,
    message: reel
      ? null
      : config.fournisseur === 'factice'
        ? MESSAGE_IA_DEMONSTRATION
        : MESSAGE_IA_NON_CONFIGUREE,
  };
}

@ApiBearerAuth('access-token')
@ApiTags('assistance-ia')
@Roles(Role.FORMATEUR, Role.ADMINISTRATEUR)
@Controller('assistance-ia')
export class EtatIaController {
  constructor(private readonly configService: ConfigService) {}

  @Get('etat')
  @ApiOperation({ summary: 'État du fournisseur d’IA (réel, démonstration ou non configuré)' })
  @ApiOkResponse({ description: '{ fournisseur, modele, reel, message } — jamais de clé' })
  lire(): EtatIa {
    return etatIa(this.configService.getOrThrow<LlmConfig>('llm'));
  }
}

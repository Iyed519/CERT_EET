import { Controller, Get, Param, Req, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { VerificationPublique, VerificationService } from './verification.service';

/**
 * Vérification PUBLIQUE d'un certificat — sans compte (US-CERT-04, DS-05).
 * Écart assumé avec DS-05 (`GET /v/:uuid`) : préfixe `/api/verification`,
 * la page web lisible par un humain étant `/verifier/:id` (lien du QR code).
 * Pas de ParseUUIDPipe : un identifiant mal formé reçoit la même 404 qu'un
 * identifiant inconnu.
 */
@ApiTags('verification')
@Public()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get(':certificatId')
  @ApiOperation({
    summary: 'Vérifier un certificat, sans compte (US-CERT-04)',
    description:
      'Verdict VALIDE, REVOQUE ou INTEGRITE_COMPROMISE (SHA-256 du PDF stocké recalculé et ' +
      'comparé à l’empreinte enregistrée), et données minimales : titulaire (prénom et nom), ' +
      'formation, organisme, mention, score, date, empreinte.',
  })
  @ApiResponse({ status: 200, description: 'Verdict ; audit CERTIFICAT_VERIFIE.' })
  @ApiResponse({
    status: 404,
    description: 'Identifiant inconnu, mal formé ou certificat pas encore émis (même réponse).',
  })
  verifier(
    @Param('certificatId') certificatId: string,
    @Req() req: Request,
  ): Promise<VerificationPublique> {
    return this.verificationService.verifier(certificatId, { adresseIp: req.ip ?? null });
  }

  @Get(':certificatId/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Télécharger le PDF d’un certificat valide (US-CERT-04)' })
  @ApiResponse({ status: 200, description: 'PDF certifié (intégrité revérifiée).' })
  @ApiResponse({
    status: 404,
    description: 'Inconnu, pas encore émis, révoqué ou intégrité compromise (même réponse).',
  })
  async pdf(@Param('certificatId') certificatId: string): Promise<StreamableFile> {
    const { contenu, nomFichier } = await this.verificationService.pdfPublic(certificatId);
    return new StreamableFile(contenu, {
      type: 'application/pdf',
      length: contenu.length,
      disposition: `attachment; filename="${nomFichier}"`,
    });
  }
}

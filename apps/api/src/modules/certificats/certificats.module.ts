import { Module } from '@nestjs/common';
import { CertificatsAdminController } from './certificats-admin.controller';
import { CertificatsApprenantController } from './certificats-apprenant.controller';
import { CertificatsService } from './certificats.service';
import { EligibiliteService } from './eligibilite.service';
import { FileCertificatsService } from './file-certificats.service';
import { LimiteDebitGuard } from './limite-debit.guard';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

/**
 * Certificats (F3 ; US-CERT-01 émission asynchrone ; US-CERT-03 « Mes
 * certificats » et téléchargement par le titulaire ; US-CERT-04 vérification
 * publique sans compte ; US-CERT-05 limitation de débit et en-têtes de
 * protection). File BullMQ sur le
 * Redis existant (ADR-04), worker dans le processus de l'api, PDF PDFKit,
 * empreinte SHA-256, QR code vers la vérification publique (ADR-10), dépôt
 * sur MinIO via StockageService (@Global). US-ATEL-09 : EligibiliteService
 * (exporté) évalue l'éligibilité après chaque note (ateliers, QCM) et demande
 * l'émission une seule fois.
 */
@Module({
  controllers: [CertificatsAdminController, CertificatsApprenantController, VerificationController],
  providers: [
    CertificatsService,
    FileCertificatsService,
    EligibiliteService,
    VerificationService,
    LimiteDebitGuard,
  ],
  exports: [CertificatsService, EligibiliteService],
})
export class CertificatsModule {}

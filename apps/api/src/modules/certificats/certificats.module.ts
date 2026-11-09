import { Module } from '@nestjs/common';
import { CertificatsAdminController } from './certificats-admin.controller';
import { CertificatsService } from './certificats.service';
import { FileCertificatsService } from './file-certificats.service';

/**
 * Certificats (F3 ; US-CERT-01 émission asynchrone). File BullMQ sur le
 * Redis existant (ADR-04), worker dans le processus de l'api, PDF PDFKit,
 * empreinte SHA-256, QR code vers la vérification publique (ADR-10), dépôt
 * sur MinIO via StockageService (@Global). CertificatsService est exporté :
 * l'éligibilité (US-ATEL-09) demande l'émission.
 */
@Module({
  controllers: [CertificatsAdminController],
  providers: [CertificatsService, FileCertificatsService],
  exports: [CertificatsService],
})
export class CertificatsModule {}

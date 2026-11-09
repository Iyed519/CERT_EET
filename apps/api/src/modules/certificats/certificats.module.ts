import { Module } from '@nestjs/common';
import { CertificatsAdminController } from './certificats-admin.controller';
import { CertificatsService } from './certificats.service';
import { EligibiliteService } from './eligibilite.service';
import { FileCertificatsService } from './file-certificats.service';

/**
 * Certificats (F3 ; US-CERT-01 émission asynchrone). File BullMQ sur le
 * Redis existant (ADR-04), worker dans le processus de l'api, PDF PDFKit,
 * empreinte SHA-256, QR code vers la vérification publique (ADR-10), dépôt
 * sur MinIO via StockageService (@Global). US-ATEL-09 : EligibiliteService
 * (exporté) évalue l'éligibilité après chaque note (ateliers, QCM) et demande
 * l'émission une seule fois.
 */
@Module({
  controllers: [CertificatsAdminController],
  providers: [CertificatsService, FileCertificatsService, EligibiliteService],
  exports: [CertificatsService, EligibiliteService],
})
export class CertificatsModule {}

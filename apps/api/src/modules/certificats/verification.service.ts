import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { Certificat } from '../../database/entities/certificat.entity';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { nomFichierCertificat, resumeErreur } from './certificat.regles';
import {
  estPublic,
  identifiantPlausible,
  Integrite,
  MESSAGE_INCONNU,
  nomTitulaire,
  verdict,
  VerdictPublic,
} from './verification.regles';

/**
 * Ce que la page publique montre (DS-05, minimisation) : ni email, ni
 * identifiant de personne, ni note détaillée, ni commentaire.
 */
export interface VerificationPublique {
  certificatId: string;
  verdict: VerdictPublic;
  integrite: Integrite;
  titulaire: string;
  formation: string;
  organismeEmetteur: string;
  mention: string;
  scoreFinal: number;
  dateEmission: Date;
  empreinteSha256: string;
  /** US-CERT-06 — date de révocation ; le motif n'est jamais publié (DS-07). */
  dateRevocation: Date | null;
}

/**
 * Vérification PUBLIQUE d'un certificat, sans compte (US-CERT-04, DS-05,
 * ADR-10).
 *
 *  - Inconnu, mal formé ou pas encore émis -> la même 404.
 *  - Émis : le PDF stocké est relu et son SHA-256 recalculé, en flux, à
 *    chaque vérification ; il est comparé à l'empreinte enregistrée à
 *    l'émission. Différent -> INTEGRITE_COMPROMISE ; stockage injoignable ->
 *    intégrité NON_VERIFIABLE (le verdict reste celui du statut).
 *  - Révoqué -> REVOQUE avec sa date (US-CERT-06) ; le motif reste interne.
 *  - Chaque vérification est tracée (CERTIFICAT_VERIFIE : verdict, adresse IP,
 *    aucun compte).
 *  - PDF public : seulement d'un certificat valide et intègre.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stockageService: StockageService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  async verifier(
    certificatId: string,
    contexte: { adresseIp: string | null },
  ): Promise<VerificationPublique> {
    const certificat = await this.chargerPublic(certificatId);
    const integrite = await this.integrite(certificat);
    const resultat = verdict(certificat.statut, integrite);
    await this.auditService.record({
      action: 'CERTIFICAT_VERIFIE',
      acteur: null,
      cible: certificat.id,
      adresseIp: contexte.adresseIp,
      resultat: resultat === 'VALIDE' ? 'Succès' : 'Échec',
      detailsAvantApres: { verdict: resultat, integrite },
    });
    return {
      certificatId: certificat.id,
      verdict: resultat,
      integrite,
      titulaire: nomTitulaire(
        certificat.apprenant?.prenom ?? null,
        certificat.apprenant?.nom ?? null,
      ),
      formation: certificat.formation?.titre ?? '',
      organismeEmetteur: certificat.organismeEmetteur,
      mention: certificat.mention,
      scoreFinal: certificat.scoreFinal,
      dateEmission: certificat.dateGeneration ?? certificat.dateEmission,
      empreinteSha256: certificat.empreinteSha256 as string,
      dateRevocation:
        certificat.statut === StatutCertificat.REVOQUE ? certificat.dateRevocation : null,
    };
  }

  /** PDF d'un certificat valide ET intègre ; sinon la même 404. */
  async pdfPublic(certificatId: string): Promise<{ contenu: Buffer; nomFichier: string }> {
    const certificat = await this.chargerPublic(certificatId);
    if (certificat.statut !== StatutCertificat.ACTIF) {
      throw new NotFoundException(MESSAGE_INCONNU);
    }
    const contenu = await this.lirePdf(certificat.cleStockage as string);
    if (
      contenu === null ||
      createHash('sha256').update(contenu).digest('hex') !== certificat.empreinteSha256
    ) {
      throw new NotFoundException(MESSAGE_INCONNU);
    }
    return { contenu, nomFichier: nomFichierCertificat(certificat.formation?.titre ?? '') };
  }

  private async chargerPublic(certificatId: string): Promise<Certificat> {
    if (!identifiantPlausible(certificatId)) throw new NotFoundException(MESSAGE_INCONNU);
    const certificat = await this.dataSource.manager.findOne(Certificat, {
      where: { id: certificatId },
      relations: { apprenant: true, formation: true },
    });
    if (!certificat || !estPublic(certificat.statut)) {
      throw new NotFoundException(MESSAGE_INCONNU);
    }
    return certificat;
  }

  private async integrite(certificat: Certificat): Promise<Integrite> {
    const contenu = await this.lirePdf(certificat.cleStockage as string);
    if (contenu === null) return 'NON_VERIFIABLE';
    const empreinte = createHash('sha256').update(contenu).digest('hex');
    return empreinte === certificat.empreinteSha256 ? 'VERIFIEE' : 'COMPROMISE';
  }

  /** Le PDF stocké (quelques dizaines de Ko), ou null si illisible. */
  private async lirePdf(cle: string): Promise<Buffer | null> {
    try {
      const { flux } = await this.stockageService.lire(cle);
      return await versTampon(flux);
    } catch (erreur) {
      this.logger.error(`PDF ${cle} illisible : ${resumeErreur(erreur)}`);
      return null;
    }
  }
}

async function versTampon(flux: Readable): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  for await (const morceau of flux) morceaux.push(Buffer.from(morceau as Buffer));
  return Buffer.concat(morceaux);
}

import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { MailConfig } from '../../config/configuration';
import { Certificat } from '../../database/entities/certificat.entity';
import { Formation } from '../../database/entities/formation.entity';
import { User } from '../../database/entities/user.entity';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { MailService } from '../../mail/mail.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { genererPdfCertificat } from './certificat-pdf';
import {
  arrondiScore,
  cleStockageCertificat,
  estAGenerer,
  mentionPour,
  nomFichierCertificat,
  ORGANISME_EMETTEUR,
  resumeErreur,
  urlVerification,
  verifierRelancable,
  verifierTelechargeable,
} from './certificat.regles';
import { FileCertificatsService } from './file-certificats.service';

/** Un certificat dans la liste de l'administrateur (liste blanche). */
export interface CertificatAdminVue {
  id: string;
  statut: StatutCertificat;
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
  formation: { id: string; titre: string };
  scoreFinal: number;
  mention: string;
  dateEmission: Date;
  dateGeneration: Date | null;
  empreinteSha256: string | null;
  nbTentatives: number;
  derniereErreur: string | null;
}

/** Un certificat, vu par son titulaire (US-CERT-03, liste blanche). */
export interface MonCertificatVue {
  id: string;
  formation: { id: string; titre: string };
  statut: StatutCertificat;
  scoreFinal: number;
  mention: string;
  organismeEmetteur: string;
  dateEmission: Date;
  dateGeneration: Date | null;
  /** SHA-256 du PDF, une fois émis ; null avant. */
  empreinteSha256: string | null;
  /** Lien public de vérification (à partager) ; null tant qu'il n'est pas émis. */
  urlVerification: string | null;
}

/** Le PDF prêt à être relayé au navigateur. */
export interface PdfCertificat {
  flux: Readable;
  nomFichier: string;
  taille: number | null;
}

export const MESSAGE_CERTIFICAT_INTROUVABLE = 'Certificat introuvable.';

/** Résultat d'une demande d'émission. */
export interface DemandeEmission {
  certificatId: string;
  /** false : un certificat existait déjà pour cet apprenant et cette formation. */
  cree: boolean;
}

/**
 * Émission ASYNCHRONE des certificats (US-CERT-01, DS-04, ADR-04, ADR-10).
 *
 *  - `demanderEmission` (appelée par US-ATEL-09) : INSERT … ON CONFLICT DO
 *    NOTHING sur (apprenant, formation) -> une seule ligne même sous
 *    concurrence ; un travail n'est ajouté que par la demande qui a créé la
 *    ligne (identifiant de travail = identifiant du certificat). Rend la main
 *    tout de suite.
 *  - `generer` (worker) : sous le verrou de la ligne, EN_ATTENTE_GENERATION ->
 *    EN_GENERATION (sinon rien : idempotent) ; PDF (PDFKit, QR vers l'URL de
 *    vérification), SHA-256 du PDF final, dépôt sur MinIO, puis ACTIF avec
 *    clé, empreinte et date de génération (heure de PostgreSQL) ; audit
 *    CERTIFICAT_EMIS ; email à l'apprenant (au mieux). Un échec remet la ligne
 *    en attente (et retire l'objet déposé) avant de relancer l'erreur : BullMQ
 *    réessaie.
 *  - `echecDefinitif` : tentatives épuisées -> audit CERTIFICAT_ECHEC ; la
 *    ligne reste en attente pour une relance manuelle (`relancer`).
 */
@Injectable()
export class CertificatsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CertificatsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly file: FileCertificatsService,
    private readonly stockageService: StockageService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    this.file.demarrerWorker({
      generer: (id) => this.generer(id),
      echecDefinitif: (id, erreur) => this.echecDefinitif(id, erreur),
    });
  }

  /** Demande l'émission (idempotente) et rend la main sans attendre le PDF. */
  async demanderEmission(
    apprenantId: string,
    formationId: string,
    scoreFinal: number,
  ): Promise<DemandeEmission> {
    // Hors de toute transaction de l'appelant : le travail n'est ajouté
    // qu'une fois la ligne VALIDÉE, sinon le worker pourrait ne pas la voir.
    const manager = this.dataSource.manager;
    const score = arrondiScore(scoreFinal);
    const lignes = (await manager.query(
      `INSERT INTO certificats
         (apprenant_id, formation_id, score_final, mention, organisme_emetteur, date_emission)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT ON CONSTRAINT "UQ_certificats_apprenant_formation" DO NOTHING
       RETURNING id`,
      [apprenantId, formationId, score, mentionPour(score), ORGANISME_EMETTEUR],
    )) as Array<{ id: string }>;
    if (lignes.length === 0) {
      const existant = await manager.findOneOrFail(Certificat, {
        where: { apprenantId, formationId },
        select: { id: true },
      });
      return { certificatId: existant.id, cree: false };
    }
    const certificatId = lignes[0].id;
    await this.auditService.record({
      action: 'CERTIFICAT_DEMANDE',
      acteur: null,
      cible: certificatId,
      adresseIp: null,
      resultat: 'Succès',
      detailsAvantApres: { apprenantId, formationId, scoreFinal: score },
    });
    await this.file.ajouter(certificatId);
    return { certificatId, cree: true };
  }

  /** Travail du worker : génère, signe (SHA-256), dépose, active. */
  async generer(certificatId: string): Promise<void> {
    const pris = await this.dataSource.transaction(async (manager) => {
      const certificat = await manager.findOne(Certificat, {
        where: { id: certificatId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!certificat || !estAGenerer(certificat.statut)) return null;
      await manager.update(
        Certificat,
        { id: certificatId },
        { statut: StatutCertificat.EN_GENERATION, nbTentatives: certificat.nbTentatives + 1 },
      );
      return certificat;
    });
    if (!pris) return;

    const cle = cleStockageCertificat(certificatId);
    let depose = false;
    try {
      const [apprenant, formation] = await Promise.all([
        this.dataSource.manager.findOneOrFail(User, {
          where: { id: pris.apprenantId },
          select: { id: true, prenom: true, nom: true, email: true },
        }),
        this.dataSource.manager.findOneOrFail(Formation, {
          where: { id: pris.formationId },
          select: { id: true, titre: true },
        }),
      ]);
      const url = urlVerification(this.baseUrl(), certificatId);
      const pdf = await genererPdfCertificat({
        certificatId,
        nomApprenant:
          [apprenant.prenom, apprenant.nom].filter(Boolean).join(' ') || apprenant.email,
        titreFormation: formation.titre,
        scoreFinal: pris.scoreFinal,
        mention: pris.mention,
        dateEmission: pris.dateEmission,
        organismeEmetteur: pris.organismeEmetteur,
        urlVerification: url,
      });
      const empreinte = createHash('sha256').update(pdf).digest('hex');
      await this.stockageService.deposerTampon(cle, pdf, 'application/pdf', empreinte);
      depose = true;
      await this.dataSource.query(
        `UPDATE certificats
            SET statut = 'ACTIF', cle_stockage = $2, empreinte_sha256 = $3,
                date_generation = now(), derniere_erreur = NULL
          WHERE id = $1 AND statut = 'EN_GENERATION'`,
        [certificatId, cle, empreinte],
      );
      await this.auditService.record({
        action: 'CERTIFICAT_EMIS',
        acteur: null,
        cible: certificatId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          apprenantId: pris.apprenantId,
          formationId: pris.formationId,
          empreinteSha256: empreinte,
          tentative: pris.nbTentatives + 1,
        },
      });
      await this.notifier(apprenant, formation.titre, url);
    } catch (erreur) {
      if (depose) await this.stockageService.supprimer([cle]);
      await this.dataSource.query(
        `UPDATE certificats SET statut = 'EN_ATTENTE_GENERATION', derniere_erreur = $2
          WHERE id = $1 AND statut = 'EN_GENERATION'`,
        [certificatId, resumeErreur(erreur)],
      );
      throw erreur;
    }
  }

  /** Tentatives épuisées : tracé ; la ligne reste en attente de relance. */
  async echecDefinitif(certificatId: string, erreur: unknown): Promise<void> {
    await this.auditService.record({
      action: 'CERTIFICAT_ECHEC',
      acteur: null,
      cible: certificatId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { erreur: resumeErreur(erreur) },
    });
  }

  /** Liste de l'administrateur (suivi de l'émission), plus récents d'abord. */
  async lister(statut?: StatutCertificat): Promise<CertificatAdminVue[]> {
    const certificats = await this.dataSource.manager.find(Certificat, {
      where: statut ? { statut } : {},
      relations: { apprenant: true, formation: true },
      order: { dateEmission: 'DESC', id: 'ASC' },
      take: 200,
    });
    return certificats.map((c) => ({
      id: c.id,
      statut: c.statut,
      apprenant: {
        id: c.apprenantId,
        prenom: c.apprenant?.prenom ?? null,
        nom: c.apprenant?.nom ?? null,
        email: c.apprenant?.email ?? '',
      },
      formation: { id: c.formationId, titre: c.formation?.titre ?? '' },
      scoreFinal: c.scoreFinal,
      mention: c.mention,
      dateEmission: c.dateEmission,
      dateGeneration: c.dateGeneration,
      empreinteSha256: c.empreinteSha256,
      nbTentatives: c.nbTentatives,
      derniereErreur: c.derniereErreur,
    }));
  }

  /**
   * Relance manuelle (administrateur) d'un certificat en attente ou bloqué en
   * génération (worker arrêté en cours de route) : sous verrou, remis en
   * attente, nouveau travail. 409 pour un certificat ACTIF ou révoqué.
   */
  async relancer(
    acteurId: string,
    certificatId: string,
    contexte: { adresseIp: string | null },
  ): Promise<CertificatAdminVue> {
    const rang = await this.dataSource.transaction(async (manager) => {
      const certificat = await manager.findOne(Certificat, {
        where: { id: certificatId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!certificat) throw new NotFoundException('Certificat introuvable.');
      verifierRelancable(certificat.statut);
      await manager.update(
        Certificat,
        { id: certificatId },
        { statut: StatutCertificat.EN_ATTENTE_GENERATION },
      );
      return certificat.nbTentatives + 1;
    });
    await this.auditService.record({
      action: 'CERTIFICAT_RELANCE',
      acteur: acteurId,
      cible: certificatId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { rang },
    });
    await this.file.ajouter(certificatId, rang);
    const [vue] = (await this.lister()).filter((c) => c.id === certificatId);
    return vue;
  }

  /** Mes certificats (US-CERT-03), plus récents d'abord. */
  async mesCertificats(apprenantId: string): Promise<MonCertificatVue[]> {
    const certificats = await this.dataSource.manager.find(Certificat, {
      where: { apprenantId },
      relations: { formation: true },
      order: { dateEmission: 'DESC', id: 'ASC' },
    });
    return certificats.map((c) => {
      const emis = c.statut === StatutCertificat.ACTIF || c.statut === StatutCertificat.REVOQUE;
      return {
        id: c.id,
        formation: { id: c.formationId, titre: c.formation?.titre ?? '' },
        statut: c.statut,
        scoreFinal: c.scoreFinal,
        mention: c.mention,
        organismeEmetteur: c.organismeEmetteur,
        dateEmission: c.dateEmission,
        dateGeneration: emis ? c.dateGeneration : null,
        empreinteSha256: emis ? c.empreinteSha256 : null,
        urlVerification: emis ? urlVerification(this.baseUrl(), c.id) : null,
      };
    });
  }

  /**
   * Le PDF de MON certificat (US-CERT-03), relayé en flux et tracé. Le
   * certificat d'un autre apprenant répond comme un identifiant inconnu (404,
   * aucune énumération) ; en préparation ou révoqué -> 409 ; stockage
   * injoignable -> 503.
   */
  async monPdf(
    apprenantId: string,
    certificatId: string,
    contexte: { adresseIp: string | null },
  ): Promise<PdfCertificat> {
    const certificat = await this.dataSource.manager.findOne(Certificat, {
      where: { id: certificatId, apprenantId },
      relations: { formation: true },
    });
    if (!certificat) throw new NotFoundException(MESSAGE_CERTIFICAT_INTROUVABLE);
    verifierTelechargeable(certificat.statut);
    let lu: { flux: Readable; taille: number | null };
    try {
      lu = await this.stockageService.lire(certificat.cleStockage as string);
    } catch (erreur) {
      this.logger.error(
        `Lecture du certificat ${certificatId} impossible : ${resumeErreur(erreur)}`,
      );
      throw new ServiceUnavailableException(
        'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.',
      );
    }
    await this.auditService.record({
      action: 'CERTIFICAT_TELECHARGE',
      acteur: apprenantId,
      cible: certificatId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { empreinteSha256: certificat.empreinteSha256 },
    });
    return {
      flux: lu.flux,
      nomFichier: nomFichierCertificat(certificat.formation?.titre ?? ''),
      taille: lu.taille,
    };
  }

  private baseUrl(): string {
    return this.configService.getOrThrow<MailConfig>('mail').appBaseUrl;
  }

  /** Email « certificat disponible » (au mieux : l'émission reste acquise). */
  private async notifier(
    apprenant: Pick<User, 'id' | 'prenom' | 'email'>,
    titreFormation: string,
    url: string,
  ): Promise<void> {
    try {
      await this.mailService.sendCertificatEmisEmail(apprenant.email, {
        prenom: apprenant.prenom,
        titreFormation,
        urlVerification: url,
      });
    } catch (erreur) {
      this.logger.error(
        `Email de certificat non envoyé (${apprenant.id}) : ${resumeErreur(erreur)}`,
      );
    }
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, FindOperator, FindOptionsWhere, ILike, IsNull, Not } from 'typeorm';
import { MailConfig } from '../../config/configuration';
import { Certificat } from '../../database/entities/certificat.entity';
import { Formation } from '../../database/entities/formation.entity';
import { User } from '../../database/entities/user.entity';
import { MotifRevocation } from '../../database/enums/motif-revocation.enum';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { MailService } from '../../mail/mail.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService, echapperLike } from '../audit/audit.service';
import { genererPdfCertificat } from './certificat-pdf';
import {
  arrondiScore,
  cleStockageCertificat,
  estAGenerer,
  LIBELLES_MOTIF_REVOCATION,
  mentionPour,
  nomFichierCertificat,
  ORGANISME_EMETTEUR,
  resumeErreur,
  urlVerification,
  verifierRelancable,
  verifierRevocable,
  verifierTelechargeable,
  MESSAGE_REPRISE_AUTOMATIQUE,
  REPRISE_CERTIFICATS,
  estEmis,
} from './certificat.regles';
import { RevoquerCertificatDto } from './certificats.dto';
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
  /** US-CERT-02 — échec définitif (tentatives épuisées), null sinon. */
  echecDefinitifLe: Date | null;
  /** US-CERT-07 — fin de validité ; null = sans expiration. */
  dateExpiration: Date | null;
  /** US-CERT-06 — null tant que le certificat n'est pas révoqué. */
  revocation: {
    date: Date;
    motif: MotifRevocation;
    description: string;
    revoquePar: string;
  } | null;
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
  /** US-CERT-06 — date et motif (catégorie) ; null si non révoqué. */
  revocation: { date: Date; motif: MotifRevocation } | null;
  /** US-CERT-07 — fin de validité ; null = sans expiration. */
  dateExpiration: Date | null;
}

/** Le PDF prêt à être relayé au navigateur. */
export interface PdfCertificat {
  flux: Readable;
  nomFichier: string;
  taille: number | null;
}

export const MESSAGE_CERTIFICAT_INTROUVABLE = 'Certificat introuvable.';

// Hash bcrypt factice (compte sans mot de passe local) : la comparaison tourne
// quand même et rend toujours faux — même défense que AdminUsersService.
const FAUX_HASH_BCRYPT = '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';

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
         (apprenant_id, formation_id, score_final, mention, organisme_emetteur, date_emission,
          date_expiration)
       SELECT $1, f.id, $3, $4, $5, now(),
              CASE WHEN f.duree_validite_mois IS NULL THEN NULL
                   ELSE now() + make_interval(months => f.duree_validite_mois) END
         FROM formations f WHERE f.id = $2
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
        {
          statut: StatutCertificat.EN_GENERATION,
          nbTentatives: certificat.nbTentatives + 1,
          debutGeneration: () => 'now()',
        },
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
                date_generation = now(), derniere_erreur = NULL, echec_definitif_le = NULL
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

  /**
   * Tentatives épuisées (US-CERT-02) : la ligne reste EN_ATTENTE_GENERATION
   * (aucun certificat partiel : `generer` a déjà retiré l'objet déposé) ;
   * l'échec définitif est daté UNE fois (UPDATE conditionnel) et chaque
   * administrateur actif est alerté par email à ce moment-là seulement ;
   * audit CERTIFICAT_ECHEC (avec `alerte`) à chaque échec définitif.
   */
  async echecDefinitif(certificatId: string, erreur: unknown): Promise<void> {
    const message = resumeErreur(erreur);
    const [lignes] = (await this.dataSource.query(
      `UPDATE certificats SET echec_definitif_le = now()
        WHERE id = $1 AND statut = 'EN_ATTENTE_GENERATION' AND echec_definitif_le IS NULL
        RETURNING id, nb_tentatives AS "nbTentatives"`,
      [certificatId],
    )) as [Array<{ id: string; nbTentatives: number }>, number];
    const premier = lignes.length > 0;
    await this.auditService.record({
      action: 'CERTIFICAT_ECHEC',
      acteur: null,
      cible: certificatId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { erreur: message, alerte: premier },
    });
    if (premier) await this.alerterAdministrateurs(certificatId, lignes[0].nbTentatives, message);
  }

  /**
   * Reprise (US-CERT-02) des certificats restés EN_GENERATION trop longtemps
   * (worker arrêté en cours de route) : remis en attente sous UPDATE
   * conditionnel (deux balayages simultanés ne reprennent pas le même),
   * audit CERTIFICAT_REPRIS, renvoyés dans la file. Renvoie leurs identifiants.
   */
  async reprendreBloques(): Promise<string[]> {
    const [lignes] = (await this.dataSource.query(
      `UPDATE certificats
          SET statut = 'EN_ATTENTE_GENERATION', derniere_erreur = $1
        WHERE statut = 'EN_GENERATION'
          AND COALESCE(debut_generation, updated_at) <= now() - make_interval(mins => $2)
        RETURNING id, nb_tentatives AS "nbTentatives"`,
      [MESSAGE_REPRISE_AUTOMATIQUE, REPRISE_CERTIFICATS.bloqueApresMinutes],
    )) as [Array<{ id: string; nbTentatives: number }>, number];
    for (const l of lignes) {
      await this.auditService.record({
        action: 'CERTIFICAT_REPRIS',
        acteur: null,
        cible: l.id,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: { rang: l.nbTentatives + 1 },
      });
      await this.file.ajouter(l.id, l.nbTentatives + 1);
    }
    return lignes.map((l) => l.id);
  }

  /** Email à chaque administrateur actif (au mieux : un échec d'envoi est journalisé). */
  private async alerterAdministrateurs(
    certificatId: string,
    nbTentatives: number,
    erreur: string,
  ): Promise<void> {
    try {
      const [admins, [contexte]] = await Promise.all([
        this.dataSource.manager.find(User, {
          where: { role: Role.ADMINISTRATEUR, statut: StatutCompte.ACTIF },
          select: { id: true, email: true, prenom: true },
        }),
        this.dataSource.query(
          `SELECT f.titre AS formation, COALESCE(NULLIF(concat_ws(' ', u.prenom, u.nom), ''), u.email) AS apprenant
             FROM certificats c JOIN formations f ON f.id = c.formation_id JOIN users u ON u.id = c.apprenant_id
            WHERE c.id = $1`,
          [certificatId],
        ) as Promise<Array<{ formation: string; apprenant: string }>>,
      ]);
      for (const a of admins) {
        try {
          await this.mailService.sendCertificatEchecEmail(a.email, {
            prenom: a.prenom,
            certificatId,
            nomApprenant: contexte?.apprenant ?? '',
            titreFormation: contexte?.formation ?? '',
            nbTentatives,
            erreur,
          });
        } catch (e) {
          this.logger.error(`Alerte d'échec non envoyée (${a.id}) : ${String(e)}`);
        }
      }
    } catch (e) {
      this.logger.error(`Alerte d'échec impossible (${certificatId}) : ${String(e)}`);
    }
  }

  /**
   * Liste de l'administrateur (suivi de l'émission), plus récents d'abord.
   * US-DASH-02 : recherche facultative (titulaire — email, prénom, nom —,
   * titre de la formation, « contient » sans casse ; ou identifiant exact).
   */
  async lister(
    statut?: StatutCertificat,
    recherche?: string,
    enEchec = false,
  ): Promise<CertificatAdminVue[]> {
    return this.vuesAdmin(
      { ...(statut ? { statut } : {}), ...(enEchec ? { echecDefinitifLe: Not(IsNull()) } : {}) },
      recherche,
    );
  }

  /** Vue administrateur d'UN certificat (après relance ou révocation). */
  private async vueAdmin(certificatId: string): Promise<CertificatAdminVue> {
    const [vue] = await this.vuesAdmin({ id: certificatId });
    return vue;
  }

  /** US-DASH-02 — Vue administrateur d'un certificat, 404 s'il n'existe pas. */
  async vueAdminOu404(certificatId: string): Promise<CertificatAdminVue> {
    const [vue] = await this.vuesAdmin({ id: certificatId });
    if (!vue) throw new NotFoundException(MESSAGE_CERTIFICAT_INTROUVABLE);
    return vue;
  }

  private async vuesAdmin(
    where: {
      statut?: StatutCertificat;
      id?: string;
      echecDefinitifLe?: FindOperator<Date>;
    },
    recherche?: string,
  ): Promise<CertificatAdminVue[]> {
    const certificats = await this.dataSource.manager.find(Certificat, {
      where: recherche ? criteresRecherche(where, recherche) : where,
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
      echecDefinitifLe: c.echecDefinitifLe,
      dateExpiration: c.dateExpiration,
      revocation:
        c.statut === StatutCertificat.REVOQUE
          ? {
              date: c.dateRevocation as Date,
              motif: c.motifRevocation as MotifRevocation,
              description: c.descriptionRevocation as string,
              revoquePar: c.revoquePar as string,
            }
          : null,
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
        { statut: StatutCertificat.EN_ATTENTE_GENERATION, echecDefinitifLe: null },
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
    return this.vueAdmin(certificatId);
  }

  /**
   * Révocation d'un certificat (US-CERT-06, DS-07, NF3).
   *
   *  1. Réauthentification de l'administrateur (bcrypt, hash factice si compte
   *     sans mot de passe local) -> 401 et audit d'échec si faux ; AVANT tout
   *     verrou (bcrypt est lent).
   *  2. Sous le verrou de la ligne : inconnu -> 404 ; déjà révoqué ou en
   *     préparation -> 409 ; sinon ACTIF -> REVOQUE avec motif, description,
   *     auteur et date (horloge de PostgreSQL). Le PDF, la clé et l'empreinte
   *     sont conservés ; le déclencheur refuse toute modification ultérieure.
   *  3. Après validation : audit CERTIFICAT_REVOQUE, email au titulaire (au
   *     mieux). La page publique affiche « Révoqué » immédiatement (elle lit la
   *     base à chaque vérification).
   */
  async revoquer(
    acteurId: string,
    certificatId: string,
    dto: RevoquerCertificatDto,
    contexte: { adresseIp: string | null },
  ): Promise<CertificatAdminVue> {
    const admin = await this.dataSource.manager.findOne(User, {
      where: { id: acteurId },
      select: { id: true, motDePasseHash: true },
    });
    const motDePasseOk = await bcrypt.compare(
      dto.motDePasseAdmin,
      admin?.motDePasseHash ?? FAUX_HASH_BCRYPT,
    );
    if (!admin || !motDePasseOk) {
      await this.auditService.record({
        action: 'CERTIFICAT_REVOCATION_REFUSEE',
        acteur: acteurId,
        cible: certificatId,
        adresseIp: contexte.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { raison: 'Mot de passe administrateur invalide' },
      });
      throw new UnauthorizedException('Mot de passe administrateur invalide.');
    }

    const revoque = await this.dataSource.transaction(async (manager) => {
      const certificat = await manager.findOne(Certificat, {
        where: { id: certificatId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!certificat) throw new NotFoundException(MESSAGE_CERTIFICAT_INTROUVABLE);
      verifierRevocable(certificat.statut);
      const [{ maintenant }] = (await manager.query('SELECT now() AS maintenant')) as Array<{
        maintenant: Date;
      }>;
      await manager.update(
        Certificat,
        { id: certificatId },
        {
          statut: StatutCertificat.REVOQUE,
          dateRevocation: maintenant,
          motifRevocation: dto.motif,
          descriptionRevocation: dto.description,
          revoquePar: acteurId,
        },
      );
      const apprenant = await manager.findOne(User, {
        where: { id: certificat.apprenantId },
        select: { id: true, prenom: true, email: true },
      });
      const formation = await manager.findOne(Formation, {
        where: { id: certificat.formationId },
        select: { id: true, titre: true },
      });
      return { apprenant, titre: formation?.titre ?? '', date: maintenant };
    });

    await this.auditService.record({
      action: 'CERTIFICAT_REVOQUE',
      acteur: acteurId,
      cible: certificatId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        avant: { statut: StatutCertificat.ACTIF },
        apres: { statut: StatutCertificat.REVOQUE, motif: dto.motif },
      },
    });
    if (revoque.apprenant) {
      try {
        await this.mailService.sendCertificatRevoqueEmail(revoque.apprenant.email, {
          prenom: revoque.apprenant.prenom,
          titreFormation: revoque.titre,
          motif: LIBELLES_MOTIF_REVOCATION[dto.motif],
          dateRevocation: revoque.date,
        });
      } catch (erreur) {
        this.logger.error(
          `Email de révocation non envoyé (${revoque.apprenant.id}) : ${resumeErreur(erreur)}`,
        );
      }
    }
    return this.vueAdmin(certificatId);
  }

  /** Mes certificats (US-CERT-03), plus récents d'abord. */
  async mesCertificats(apprenantId: string): Promise<MonCertificatVue[]> {
    const certificats = await this.dataSource.manager.find(Certificat, {
      where: { apprenantId },
      relations: { formation: true },
      order: { dateEmission: 'DESC', id: 'ASC' },
    });
    return certificats.map((c) => {
      const emis = estEmis(c.statut);
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
        revocation:
          c.statut === StatutCertificat.REVOQUE
            ? { date: c.dateRevocation as Date, motif: c.motifRevocation as MotifRevocation }
            : null,
        dateExpiration: c.dateExpiration,
      };
    });
  }

  /**
   * US-CERT-07 — Expiration : les certificats ACTIFS dont la date
   * d'expiration est atteinte passent EXPIRE (UPDATE conditionnel : deux
   * balayages simultanés n'expirent pas deux fois le même), audit
   * CERTIFICAT_EXPIRE. Le PDF et l'empreinte sont conservés ; la vérification
   * publique affiche « Expiré ». Renvoie les identifiants expirés.
   */
  async expirerEchus(): Promise<string[]> {
    const [lignes] = (await this.dataSource.query(
      `UPDATE certificats SET statut = 'EXPIRE'
        WHERE statut = 'ACTIF' AND date_expiration IS NOT NULL AND date_expiration <= now()
        RETURNING id, apprenant_id AS "apprenantId", formation_id AS "formationId",
                  date_expiration AS "dateExpiration"`,
    )) as [
      Array<{ id: string; apprenantId: string; formationId: string; dateExpiration: Date }>,
      number,
    ];
    for (const l of lignes) {
      await this.auditService.record({
        action: 'CERTIFICAT_EXPIRE',
        acteur: null,
        cible: l.id,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          avant: { statut: 'ACTIF' },
          apres: { statut: 'EXPIRE' },
          apprenantId: l.apprenantId,
          formationId: l.formationId,
          dateExpiration: l.dateExpiration,
        },
      });
    }
    return lignes.map((l) => l.id);
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

const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * US-DASH-02 — Critères « OU » de la recherche : email, prénom ou nom du
 * titulaire, titre de la formation (contient, sans casse, jokers LIKE
 * neutralisés), ou identifiant exact du certificat ; chacun combiné au filtre
 * de statut.
 */
export function criteresRecherche(
  base: { statut?: StatutCertificat; id?: string; echecDefinitifLe?: FindOperator<Date> },
  recherche: string,
): FindOptionsWhere<Certificat>[] {
  const saisie = recherche.trim();
  const motif = ILike(`%${echapperLike(saisie)}%`);
  const criteres: FindOptionsWhere<Certificat>[] = [
    { ...base, apprenant: { email: motif } },
    { ...base, apprenant: { prenom: motif } },
    { ...base, apprenant: { nom: motif } },
    { ...base, formation: { titre: motif } },
  ];
  if (FORMAT_UUID.test(saisie)) criteres.push({ ...base, id: saisie });
  return criteres;
}

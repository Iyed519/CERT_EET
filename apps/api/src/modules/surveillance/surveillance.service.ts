import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { SurveillanceConfig } from '../../config/configuration';
import { Role } from '../../database/enums/role.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { RedisService } from '../../redis/redis.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { AutorisationRessourceService } from '../formations/autorisation/autorisation-ressource.service';
import {
  attenteAvantCapture,
  capturesMax,
  LIEN_CAPTURE_SECONDES,
  limiteConservation,
  MESSAGE_ALTERNATIVE,
  PREFIXE_JETON_CAPTURE,
  typeImage,
} from './surveillance.regles';

interface Contexte {
  adresseIp: string | null;
  methode: string;
  route: string;
}

export interface CaptureVue {
  id: string;
  priseLe: Date;
  tailleOctets: number;
}

export interface CapturesTentativeVue {
  tentativeId: string;
  consentementLe: Date | null;
  conservationJours: number;
  captures: CaptureVue[];
}

interface LigneTentative {
  id: string;
  apprenant_id: string;
  statut: StatutTentative;
  date_limite: Date;
  consentement_surveillance_le: Date | null;
  formation_id: string;
  proctoring_webcam: boolean;
  duree_max_minutes: number;
}

const MESSAGE_TENTATIVE_INTROUVABLE = 'Tentative introuvable.';
const MESSAGE_LIEN_EXPIRE = 'Lien expiré ou invalide.';
const MESSAGE_ACCES =
  'Accès réservé au formateur affecté à cette formation et aux administrateurs.';

/**
 * US-QCM-12 — Surveillance webcam par captures.
 *
 * - Dépôt : par l'apprenant de la tentative seulement, tentative EN_COURS et
 *   dans les temps, QCM surveillé, consentement enregistré ; image JPEG / PNG
 *   reconnue à sa signature, 100 Ko au plus ; écart minimal entre deux
 *   captures et nombre borné. Stockage privé (`surveillance/<tentative>/…`).
 * - Consultation : formateur affecté à la formation ou administrateur ; tout
 *   autre -> 403 + ACCES_RESSOURCE_REFUSE ; chaque consultation est
 *   journalisée. Images servies par lien signé de 2 minutes, jamais d'URL
 *   publique durable.
 * - Purge : captures plus anciennes que la durée de conservation supprimées
 *   (stockage puis base), suppression journalisée ; balayage planifié.
 * - Aucune analyse automatique des images.
 */
@Injectable()
export class SurveillanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurveillanceService.name);
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly stockage: StockageService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly autorisation: AutorisationRessourceService,
    private readonly configService: ConfigService,
  ) {}

  private get config(): SurveillanceConfig {
    return this.configService.getOrThrow<SurveillanceConfig>('surveillance');
  }

  onModuleInit(): void {
    if (!this.config.balayageActif) return;
    this.minuteur = setInterval(() => {
      void this.purger().catch((e: unknown) =>
        this.logger.error(`Purge des captures impossible : ${String(e)}`),
      );
    }, this.config.balayageMinutes * 60_000);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Refus explicite (ou caméra absente) avant le démarrage : journalisé. */
  async refuser(
    apprenantId: string,
    qcmId: string,
    motif: 'REFUS' | 'CAMERA_INDISPONIBLE',
    contexte: Contexte,
  ): Promise<{ message: string }> {
    const [qcm] = (await this.dataSource.query(
      `SELECT q.id FROM qcm q JOIN config_anti_fraude c ON c.qcm_id = q.id
        WHERE q.id = $1 AND q.statut = 'PUBLIE' AND c.proctoring_webcam`,
      [qcmId],
    )) as Array<{ id: string }>;
    if (!qcm) throw new NotFoundException('QCM introuvable ou non surveillé.');
    await this.auditService.record({
      action: 'SURVEILLANCE_REFUSEE',
      acteur: apprenantId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Échec',
      detailsAvantApres: { motif },
    });
    return { message: MESSAGE_ALTERNATIVE };
  }

  async deposer(apprenantId: string, tentativeId: string, contenu: Buffer): Promise<CaptureVue> {
    const config = this.config;
    if (contenu.length > config.tailleMaxOctets) {
      throw new PayloadTooLargeException('Capture trop volumineuse (100 Ko au plus).');
    }
    const type = typeImage(contenu);
    if (!type) throw new BadRequestException('La capture doit être une image JPEG ou PNG.');
    const sha256 = createHash('sha256').update(contenu).digest('hex');
    const id = randomUUID();
    const cle = `surveillance/${tentativeId}/${id}.${type === 'image/png' ? 'png' : 'jpg'}`;

    // Décision sous le verrou de la tentative : deux envois simultanés ne
    // dépassent ni l'écart minimal ni le nombre maximal.
    const decision = await this.dataSource.transaction(async (em) => {
      const [t] = (await em.query(
        `SELECT t.id, t.apprenant_id, t.statut, t.date_limite, t.consentement_surveillance_le,
                c.proctoring_webcam, c.duree_max_minutes
           FROM tentatives_qcm t JOIN config_anti_fraude c ON c.qcm_id = t.qcm_id
          WHERE t.id = $1 FOR UPDATE OF t`,
        [tentativeId],
      )) as LigneTentative[];
      if (!t || t.apprenant_id !== apprenantId) {
        throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
      }
      const [{ maintenant }] = (await em.query('SELECT now() AS maintenant')) as Array<{
        maintenant: Date;
      }>;
      if (
        t.statut !== StatutTentative.EN_COURS ||
        new Date(t.date_limite).getTime() <= new Date(maintenant).getTime()
      ) {
        throw new ConflictException('La tentative est terminée : plus de capture.');
      }
      if (!t.proctoring_webcam || !config.active || !t.consentement_surveillance_le) {
        throw new ConflictException('Cette tentative n’est pas surveillée.');
      }
      const [stats] = (await em.query(
        `SELECT count(*)::int AS n, max(prise_le) AS derniere FROM captures_webcam WHERE tentative_id = $1`,
        [tentativeId],
      )) as Array<{ n: number; derniere: Date | null }>;
      if (stats.n >= capturesMax(t.duree_max_minutes, config.intervalleSecondes)) {
        throw new ConflictException('Nombre maximal de captures atteint pour cette tentative.');
      }
      const attente = attenteAvantCapture(
        stats.derniere ? new Date(stats.derniere) : null,
        new Date(maintenant),
        config.intervalleSecondes,
      );
      if (attente > 0) {
        throw new HttpException(
          {
            statusCode: 429,
            message: `Capture trop rapprochée : réessayez dans ${attente} s.`,
            attente,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await em.query(
        `INSERT INTO captures_webcam (id, tentative_id, cle_stockage, taille_octets, type_contenu, prise_le)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tentativeId, cle, contenu.length, type, maintenant],
      );
      // Dépôt dans la transaction : un stockage en panne annule la ligne.
      try {
        await this.stockage.deposerTampon(cle, contenu, type, sha256);
      } catch (erreur) {
        this.logger.error(`Dépôt d'une capture impossible (${tentativeId}) : ${String(erreur)}`);
        throw new ServiceUnavailableException('Stockage indisponible : capture non enregistrée.');
      }
      return { priseLe: new Date(maintenant) };
    });
    return { id, priseLe: decision.priseLe, tailleOctets: contenu.length };
  }

  /** Liste des captures d'une tentative, pour le formateur affecté ou l'admin. */
  async lister(
    utilisateur: { id: string; role: Role },
    tentativeId: string,
    contexte: Contexte,
  ): Promise<CapturesTentativeVue> {
    const t = await this.exigerAccesRevue(utilisateur, tentativeId, contexte);
    const captures = (await this.dataSource.query(
      `SELECT id, prise_le AS "priseLe", taille_octets AS "tailleOctets"
         FROM captures_webcam WHERE tentative_id = $1 ORDER BY prise_le`,
      [tentativeId],
    )) as CaptureVue[];
    await this.auditService.record({
      action: 'CAPTURES_CONSULTEES',
      acteur: utilisateur.id,
      cible: tentativeId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { nbCaptures: captures.length },
    });
    return {
      tentativeId,
      consentementLe: t.consentement_surveillance_le,
      conservationJours: this.config.conservationJours,
      captures,
    };
  }

  /** Lien signé (2 min) vers une capture, pour le formateur affecté ou l'admin. */
  async lien(
    utilisateur: { id: string; role: Role },
    captureId: string,
    contexte: Contexte,
  ): Promise<{ url: string; expireDansSecondes: number }> {
    const [c] = (await this.dataSource.query(
      `SELECT tentative_id FROM captures_webcam WHERE id = $1`,
      [captureId],
    )) as Array<{ tentative_id: string }>;
    if (!c) throw new NotFoundException('Capture introuvable.');
    await this.exigerAccesRevue(utilisateur, c.tentative_id, contexte);
    const jeton = randomBytes(32).toString('base64url');
    await this.redis.set(
      `${PREFIXE_JETON_CAPTURE}${jeton}`,
      JSON.stringify({ captureId, utilisateurId: utilisateur.id }),
      LIEN_CAPTURE_SECONDES,
    );
    return { url: `/api/captures/fichier/${jeton}`, expireDansSecondes: LIEN_CAPTURE_SECONDES };
  }

  /** Sert l'image d'un lien valide (route publique) ; 404 uniforme sinon. */
  async servir(jeton: string): Promise<{ flux: Readable; type: string; taille: number }> {
    const valeur = /^[A-Za-z0-9_-]{43}$/.test(jeton)
      ? await this.redis.get(`${PREFIXE_JETON_CAPTURE}${jeton}`)
      : null;
    if (!valeur) throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    const { captureId } = JSON.parse(valeur) as { captureId: string };
    const [c] = (await this.dataSource.query(
      `SELECT cle_stockage, type_contenu, taille_octets FROM captures_webcam WHERE id = $1`,
      [captureId],
    )) as Array<{ cle_stockage: string; type_contenu: string; taille_octets: number }>;
    if (!c) throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    try {
      const { flux } = await this.stockage.lire(c.cle_stockage);
      return { flux, type: c.type_contenu, taille: c.taille_octets };
    } catch (erreur) {
      this.logger.error(`Lecture d'une capture impossible (${captureId}) : ${String(erreur)}`);
      throw new ServiceUnavailableException('Stockage indisponible.');
    }
  }

  /**
   * Purge des captures plus anciennes que la durée de conservation (ou
   * toutes celles d'un apprenant, à l'anonymisation de son compte — US-CPT-04).
   * Stockage d'abord, base ensuite ; suppression journalisée sans donnée
   * personnelle. Renvoie le nombre de captures supprimées.
   */
  async purger(options: { apprenantId?: string; acteur?: string | null } = {}): Promise<number> {
    const lignes = options.apprenantId
      ? ((await this.dataSource.query(
          `SELECT c.id, c.cle_stockage FROM captures_webcam c
             JOIN tentatives_qcm t ON t.id = c.tentative_id WHERE t.apprenant_id = $1`,
          [options.apprenantId],
        )) as Array<{ id: string; cle_stockage: string }>)
      : ((await this.dataSource.query(
          `SELECT id, cle_stockage FROM captures_webcam WHERE prise_le < $1`,
          [limiteConservation(new Date(), this.config.conservationJours)],
        )) as Array<{ id: string; cle_stockage: string }>);
    if (lignes.length === 0) return 0;
    await this.stockage.supprimer(lignes.map((l) => l.cle_stockage));
    await this.dataSource.query(`DELETE FROM captures_webcam WHERE id = ANY($1::uuid[])`, [
      lignes.map((l) => l.id),
    ]);
    await this.auditService.record({
      action: 'CAPTURES_PURGEES',
      acteur: options.acteur ?? null,
      cible: options.apprenantId ?? null,
      resultat: 'Succès',
      detailsAvantApres: {
        nbCaptures: lignes.length,
        cause: options.apprenantId ? 'ANONYMISATION' : 'CONSERVATION',
        conservationJours: this.config.conservationJours,
      },
    });
    return lignes.length;
  }

  /** Formateur affecté à la formation de la tentative, ou administrateur. */
  private async exigerAccesRevue(
    utilisateur: { id: string; role: Role },
    tentativeId: string,
    contexte: Contexte,
  ): Promise<LigneTentative> {
    const [t] = (await this.dataSource.query(
      `SELECT t.id, t.consentement_surveillance_le, m.formation_id
         FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
         JOIN modules m ON m.id = q.module_id
        WHERE t.id = $1`,
      [tentativeId],
    )) as LigneTentative[];
    if (!t) throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    const autorise =
      utilisateur.role === Role.ADMINISTRATEUR ||
      (utilisateur.role === Role.FORMATEUR &&
        (await this.autorisation.estAffecte(t.formation_id, utilisateur.id)));
    if (!autorise) {
      await this.auditService.record({
        action: 'ACCES_RESSOURCE_REFUSE',
        acteur: utilisateur.id,
        cible: t.formation_id,
        adresseIp: contexte.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: {
          ressource: 'captures_webcam',
          tentativeId,
          methode: contexte.methode,
          route: contexte.route,
        },
      });
      throw new ForbiddenException(MESSAGE_ACCES);
    }
    return t;
  }
}

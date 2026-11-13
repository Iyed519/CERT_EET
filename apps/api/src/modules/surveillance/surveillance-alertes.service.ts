import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
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
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../redis/redis.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import {
  ALERTES_MAX_PAR_TENTATIVE,
  confianceValide,
  ECART_MIN_MEME_ALERTE_SECONDES,
  estTypeEvenement,
  LIBELLES_EVENEMENT,
  LIEN_CAPTURE_SECONDES,
  TAILLE_MAX_PHOTO_ALERTE,
  TypeEvenement,
  typeImage,
} from './surveillance.regles';

export const PREFIXE_JETON_ALERTE = 'surveillance:alerte:lien:';
export type StatutAlerteSurveillance = 'NOUVEAU' | 'EXAMINE';

interface Contexte {
  adresseIp: string | null;
  methode: string;
  route: string;
}

/** Une alerte telle que la voit le formateur. */
export interface AlerteSurveillanceVue {
  id: string;
  type: TypeEvenement;
  libelle: string;
  confiance: number | null;
  detecteLe: Date;
  statut: StatutAlerteSurveillance;
  examineLe: Date | null;
  tentativeId: string;
  qcm: { id: string; titre: string };
  formation: { id: string; titre: string };
  apprenant: { prenom: string | null; nom: string | null; email: string };
}

interface LigneAlerte {
  id: string;
  type: TypeEvenement;
  confiance: string | null;
  detecte_le: Date;
  statut: StatutAlerteSurveillance;
  examine_le: Date | null;
  tentative_id: string;
  qcm_id: string;
  qcm_titre: string;
  formation_id: string;
  formation_titre: string;
  prenom: string | null;
  nom: string | null;
  email: string;
}

const MESSAGE_TENTATIVE_INTROUVABLE = 'Tentative introuvable.';
const MESSAGE_ALERTE_INTROUVABLE = 'Alerte introuvable.';
const MESSAGE_LIEN_EXPIRE = 'Lien expiré ou invalide.';
const MESSAGE_ACCES =
  'Accès réservé au formateur affecté à cette formation et aux administrateurs.';

/** Colonnes et jointures d'une alerte vue par le formateur. */
const SELECT_ALERTE = `
  SELECT e.id, e.type, e.confiance, e.detecte_le, e.statut, e.examine_le, e.tentative_id,
         q.id AS qcm_id, q.titre AS qcm_titre, f.id AS formation_id, f.titre AS formation_titre,
         u.prenom, u.nom, u.email
    FROM evenements_surveillance e
    JOIN tentatives_qcm t ON t.id = e.tentative_id
    JOIN qcm q ON q.id = t.qcm_id
    JOIN modules m ON m.id = q.module_id
    JOIN formations f ON f.id = m.formation_id
    JOIN users u ON u.id = t.apprenant_id`;

const vue = (l: LigneAlerte): AlerteSurveillanceVue => ({
  id: l.id,
  type: l.type,
  libelle: LIBELLES_EVENEMENT[l.type],
  confiance: l.confiance === null ? null : Number(l.confiance),
  detecteLe: l.detecte_le,
  statut: l.statut,
  examineLe: l.examine_le,
  tentativeId: l.tentative_id,
  qcm: { id: l.qcm_id, titre: l.qcm_titre },
  formation: { id: l.formation_id, titre: l.formation_titre },
  apprenant: { prenom: l.prenom, nom: l.nom, email: l.email },
});

/**
 * US-QCM-15 — Alertes de la surveillance par IA.
 *
 * L'analyse tourne dans le navigateur de l'apprenant (MediaPipe) ; le serveur
 * reçoit seulement l'anomalie et la photo prise à l'instant de la détection.
 * - Dépôt : l'apprenant de la tentative, EN_COURS et dans les temps, QCM
 *   surveillé, consentement donné ; photo JPEG / PNG (signature), 200 Ko au
 *   plus ; même anomalie 30 s au moins après la précédente ; 60 au plus.
 *   À la PREMIÈRE alerte d'une tentative : e-mail aux formateurs affectés
 *   (lien seulement, jamais la photo).
 * - Lecture, lien signé (2 min), examen : formateur affecté ou administrateur ;
 *   sinon 403 + ACCES_RESSOURCE_REFUSE. L'IA signale, le formateur décide.
 */
@Injectable()
export class SurveillanceAlertesService {
  private readonly logger = new Logger(SurveillanceAlertesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stockage: StockageService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private get config(): SurveillanceConfig {
    return this.configService.getOrThrow<SurveillanceConfig>('surveillance');
  }

  /** Dépôt d'une alerte par l'apprenant (photo du moment de la détection). */
  async deposer(
    apprenantId: string,
    tentativeId: string,
    entree: { type: unknown; confiance: unknown; photo: Buffer },
    contexte: Contexte,
  ): Promise<{ id: string; type: TypeEvenement; detecteLe: Date }> {
    if (!estTypeEvenement(entree.type)) {
      throw new BadRequestException('Type d’alerte inconnu.');
    }
    const type = entree.type;
    if (entree.photo.length > TAILLE_MAX_PHOTO_ALERTE) {
      throw new PayloadTooLargeException('Photo trop volumineuse (200 Ko au plus).');
    }
    const typeContenu = typeImage(entree.photo);
    if (!typeContenu) throw new BadRequestException('La photo doit être une image JPEG ou PNG.');
    const confiance = confianceValide(entree.confiance);
    const sha256 = createHash('sha256').update(entree.photo).digest('hex');
    const id = randomUUID();
    const cle = `surveillance/${tentativeId}/evenements/${id}.${typeContenu === 'image/png' ? 'png' : 'jpg'}`;

    const resultat = await this.dataSource.transaction(async (em) => {
      const [t] = (await em.query(
        `SELECT t.id, t.apprenant_id, t.statut, t.date_limite, t.consentement_surveillance_le,
                t.qcm_id, c.proctoring_webcam
           FROM tentatives_qcm t JOIN config_anti_fraude c ON c.qcm_id = t.qcm_id
          WHERE t.id = $1 FOR UPDATE OF t`,
        [tentativeId],
      )) as Array<{
        apprenant_id: string;
        statut: StatutTentative;
        date_limite: Date;
        consentement_surveillance_le: Date | null;
        qcm_id: string;
        proctoring_webcam: boolean;
      }>;
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
        throw new ConflictException('La tentative est terminée : plus d’alerte.');
      }
      if (!t.proctoring_webcam || !this.config.active || !t.consentement_surveillance_le) {
        throw new ConflictException('Cette tentative n’est pas surveillée.');
      }
      const [stats] = (await em.query(
        `SELECT count(*)::int AS n,
                max(detecte_le) FILTER (WHERE type = $2) AS derniere
           FROM evenements_surveillance WHERE tentative_id = $1`,
        [tentativeId, type],
      )) as Array<{ n: number; derniere: Date | null }>;
      if (stats.n >= ALERTES_MAX_PAR_TENTATIVE) {
        throw new ConflictException('Nombre maximal d’alertes atteint pour cette tentative.');
      }
      if (stats.derniere) {
        const ecart = (new Date(maintenant).getTime() - new Date(stats.derniere).getTime()) / 1000;
        if (ecart < ECART_MIN_MEME_ALERTE_SECONDES) {
          const attente = Math.ceil(ECART_MIN_MEME_ALERTE_SECONDES - ecart);
          throw new HttpException(
            {
              statusCode: 429,
              message: `Même alerte trop rapprochée : réessayez dans ${attente} s.`,
              attente,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      await em.query(
        `INSERT INTO evenements_surveillance
           (id, tentative_id, type, confiance, cle_stockage, taille_octets, type_contenu, detecte_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, tentativeId, type, confiance, cle, entree.photo.length, typeContenu, maintenant],
      );
      // Dépôt dans la transaction : un stockage en panne annule la ligne.
      try {
        await this.stockage.deposerTampon(cle, entree.photo, typeContenu, sha256);
      } catch (erreur) {
        this.logger.error(`Dépôt d'une photo d'alerte impossible (${tentativeId}) : ${String(erreur)}`);
        throw new ServiceUnavailableException('Stockage indisponible : alerte non enregistrée.');
      }
      return { detecteLe: new Date(maintenant), premiere: stats.n === 0, qcmId: t.qcm_id };
    });

    await this.auditService.record({
      action: 'SURVEILLANCE_ALERTE',
      acteur: apprenantId,
      cible: tentativeId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { evenementId: id, type, confiance },
    });
    if (resultat.premiere) await this.prevenirFormateurs(tentativeId, type);
    return { id, type, detecteLe: resultat.detecteLe };
  }

  /**
   * File du formateur : alertes des formations où il est affecté (toutes pour
   * l'administrateur), nouvelles d'abord puis les plus récentes ; 200 au plus.
   */
  async file(
    utilisateur: { id: string; role: Role },
    statut: StatutAlerteSurveillance | null,
    contexte: Contexte,
  ): Promise<AlerteSurveillanceVue[]> {
    const admin = utilisateur.role === Role.ADMINISTRATEUR;
    const lignes = (await this.dataSource.query(
      `${SELECT_ALERTE}
        WHERE ($1::boolean OR EXISTS (
                SELECT 1 FROM formation_formateurs ff
                 WHERE ff.formation_id = f.id AND ff.formateur_id = $2))
          AND ($3::text IS NULL OR e.statut = $3)
        ORDER BY (e.statut = 'NOUVEAU') DESC, e.detecte_le DESC, e.id
        LIMIT 200`,
      [admin, utilisateur.id, statut],
    )) as LigneAlerte[];
    await this.auditService.record({
      action: 'ALERTES_SURVEILLANCE_CONSULTEES',
      acteur: utilisateur.id,
      cible: null,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { statut, nbAlertes: lignes.length },
    });
    return lignes.map(vue);
  }

  /** Nombre d'alertes à examiner (À faire maintenant). */
  async aExaminer(utilisateur: { id: string; role: Role }): Promise<{ nombre: number }> {
    const [{ n }] = (await this.dataSource.query(
      `SELECT count(*)::int AS n
         FROM evenements_surveillance e
         JOIN tentatives_qcm t ON t.id = e.tentative_id
         JOIN qcm q ON q.id = t.qcm_id
         JOIN modules m ON m.id = q.module_id
        WHERE e.statut = 'NOUVEAU'
          AND ($1::boolean OR EXISTS (
                SELECT 1 FROM formation_formateurs ff
                 WHERE ff.formation_id = m.formation_id AND ff.formateur_id = $2))`,
      [utilisateur.role === Role.ADMINISTRATEUR, utilisateur.id],
    )) as Array<{ n: number }>;
    return { nombre: n };
  }

  /** Alertes d'une tentative (fenêtre de détail), formateur affecté ou admin. */
  async deTentative(
    utilisateur: { id: string; role: Role },
    tentativeId: string,
    contexte: Contexte,
  ): Promise<AlerteSurveillanceVue[]> {
    const formationId = await this.formationDeTentative(tentativeId);
    await this.exigerAcces(utilisateur, formationId, contexte, { tentativeId });
    const lignes = (await this.dataSource.query(
      `${SELECT_ALERTE} WHERE e.tentative_id = $1 ORDER BY e.detecte_le, e.id`,
      [tentativeId],
    )) as LigneAlerte[];
    return lignes.map(vue);
  }

  /** Marque une alerte examinée (ou à examiner de nouveau). */
  async examiner(
    utilisateur: { id: string; role: Role },
    alerteId: string,
    statut: StatutAlerteSurveillance,
    contexte: Contexte,
  ): Promise<AlerteSurveillanceVue> {
    const ligne = await this.lireAlerte(alerteId);
    await this.exigerAcces(utilisateur, ligne.formation_id, contexte, { alerteId });
    await this.dataSource.query(
      `UPDATE evenements_surveillance
          SET statut = $2::varchar,
              examine_par = CASE WHEN $2::varchar = 'EXAMINE' THEN $3::uuid END,
              examine_le = CASE WHEN $2::varchar = 'EXAMINE' THEN now() END
        WHERE id = $1`,
      [alerteId, statut, utilisateur.id],
    );
    await this.auditService.record({
      action: 'ALERTE_SURVEILLANCE_EXAMINEE',
      acteur: utilisateur.id,
      cible: ligne.tentative_id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { alerteId, avant: ligne.statut, apres: statut },
    });
    return vue(await this.lireAlerte(alerteId));
  }

  /** Lien signé (2 min) vers la photo d'une alerte. */
  async lien(
    utilisateur: { id: string; role: Role },
    alerteId: string,
    contexte: Contexte,
  ): Promise<{ url: string; expireDansSecondes: number }> {
    const ligne = await this.lireAlerte(alerteId);
    await this.exigerAcces(utilisateur, ligne.formation_id, contexte, { alerteId });
    const jeton = randomBytes(32).toString('base64url');
    await this.redis.set(
      `${PREFIXE_JETON_ALERTE}${jeton}`,
      JSON.stringify({ alerteId, utilisateurId: utilisateur.id }),
      LIEN_CAPTURE_SECONDES,
    );
    return {
      url: `/api/surveillance/alertes/photo/${jeton}`,
      expireDansSecondes: LIEN_CAPTURE_SECONDES,
    };
  }

  /** Sert la photo d'un lien valide (route publique) ; 404 uniforme sinon. */
  async servir(jeton: string): Promise<{ flux: Readable; type: string; taille: number }> {
    const valeur = /^[A-Za-z0-9_-]{43}$/.test(jeton)
      ? await this.redis.get(`${PREFIXE_JETON_ALERTE}${jeton}`)
      : null;
    if (!valeur) throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    const { alerteId } = JSON.parse(valeur) as { alerteId: string };
    const [e] = (await this.dataSource.query(
      `SELECT cle_stockage, type_contenu, taille_octets FROM evenements_surveillance WHERE id = $1`,
      [alerteId],
    )) as Array<{ cle_stockage: string; type_contenu: string; taille_octets: number }>;
    if (!e) throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    try {
      const { flux } = await this.stockage.lire(e.cle_stockage);
      return { flux, type: e.type_contenu, taille: e.taille_octets };
    } catch (erreur) {
      this.logger.error(`Lecture d'une photo d'alerte impossible (${alerteId}) : ${String(erreur)}`);
      throw new ServiceUnavailableException('Stockage indisponible.');
    }
  }

  /**
   * Purge des photos d'alertes : plus anciennes que la conservation, ou toutes
   * celles d'un apprenant (anonymisation). Stockage d'abord, base ensuite.
   */
  async purger(options: { apprenantId?: string; avant?: Date } = {}): Promise<number> {
    const lignes = options.apprenantId
      ? ((await this.dataSource.query(
          `SELECT e.id, e.cle_stockage FROM evenements_surveillance e
             JOIN tentatives_qcm t ON t.id = e.tentative_id WHERE t.apprenant_id = $1`,
          [options.apprenantId],
        )) as Array<{ id: string; cle_stockage: string }>)
      : ((await this.dataSource.query(
          `SELECT id, cle_stockage FROM evenements_surveillance WHERE detecte_le < $1`,
          [options.avant ?? new Date(0)],
        )) as Array<{ id: string; cle_stockage: string }>);
    if (lignes.length === 0) return 0;
    await this.stockage.supprimer(lignes.map((l) => l.cle_stockage));
    await this.dataSource.query(`DELETE FROM evenements_surveillance WHERE id = ANY($1::uuid[])`, [
      lignes.map((l) => l.id),
    ]);
    return lignes.length;
  }

  private async lireAlerte(alerteId: string): Promise<LigneAlerte> {
    const [l] = (await this.dataSource.query(`${SELECT_ALERTE} WHERE e.id = $1`, [
      alerteId,
    ])) as LigneAlerte[];
    if (!l) throw new NotFoundException(MESSAGE_ALERTE_INTROUVABLE);
    return l;
  }

  private async formationDeTentative(tentativeId: string): Promise<string> {
    const [t] = (await this.dataSource.query(
      `SELECT m.formation_id FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
         JOIN modules m ON m.id = q.module_id WHERE t.id = $1`,
      [tentativeId],
    )) as Array<{ formation_id: string }>;
    if (!t) throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    return t.formation_id;
  }

  /** Formateur affecté à la formation, ou administrateur ; sinon 403 journalisé. */
  private async exigerAcces(
    utilisateur: { id: string; role: Role },
    formationId: string,
    contexte: Contexte,
    details: Record<string, string>,
  ): Promise<void> {
    if (utilisateur.role === Role.ADMINISTRATEUR) return;
    const [affecte] = (await this.dataSource.query(
      `SELECT 1 FROM formation_formateurs WHERE formation_id = $1 AND formateur_id = $2`,
      [formationId, utilisateur.id],
    )) as unknown[];
    if (utilisateur.role === Role.FORMATEUR && affecte) return;
    await this.auditService.record({
      action: 'ACCES_RESSOURCE_REFUSE',
      acteur: utilisateur.id,
      cible: formationId,
      adresseIp: contexte.adresseIp,
      resultat: 'Échec',
      detailsAvantApres: {
        ressource: 'evenements_surveillance',
        ...details,
        methode: contexte.methode,
        route: contexte.route,
      },
    });
    throw new ForbiddenException(MESSAGE_ACCES);
  }

  /** E-mail aux formateurs affectés, à la première alerte d'une tentative (au mieux). */
  private async prevenirFormateurs(tentativeId: string, type: TypeEvenement): Promise<void> {
    try {
      const [contexte] = (await this.dataSource.query(
        `SELECT q.titre AS qcm, f.titre AS formation, f.id AS formation_id,
                concat_ws(' ', u.prenom, u.nom) AS apprenant, u.email AS email_apprenant
           FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
           JOIN modules m ON m.id = q.module_id JOIN formations f ON f.id = m.formation_id
           JOIN users u ON u.id = t.apprenant_id
          WHERE t.id = $1`,
        [tentativeId],
      )) as Array<{
        qcm: string;
        formation: string;
        formation_id: string;
        apprenant: string;
        email_apprenant: string;
      }>;
      if (!contexte) return;
      const formateurs = (await this.dataSource.query(
        `SELECT u.email, u.prenom FROM formation_formateurs ff JOIN users u ON u.id = ff.formateur_id
          WHERE ff.formation_id = $1 AND u.statut = 'ACTIF'`,
        [contexte.formation_id],
      )) as Array<{ email: string; prenom: string | null }>;
      for (const f of formateurs) {
        await this.mailService.sendAlerteSurveillanceEmail(f.email, {
          prenom: f.prenom,
          apprenant: contexte.apprenant.trim() || contexte.email_apprenant,
          qcm: contexte.qcm,
          formation: contexte.formation,
          anomalie: LIBELLES_EVENEMENT[type],
        });
      }
    } catch (erreur) {
      this.logger.error(`E-mail d'alerte de surveillance non envoyé (${tentativeId}) : ${String(erreur)}`);
    }
  }
}

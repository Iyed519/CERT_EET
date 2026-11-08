import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { EntityManager } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditService } from '../audit/audit.service';
import {
  MESSAGE_SESSION_ACTIVE_AILLEURS,
  RAISON_SESSION_ACTIVE_AILLEURS,
  cleSessionQcm,
  evaluerSession,
  trancherSession,
} from './tentative-session.regles';

/** Issue du contrôle : la tentative peut être utilisée, ou non. */
export type ControleSession = 'autorisee' | 'adoptee' | 'refusee';

/** Ce que l'audit d'un refus doit savoir. */
export interface RefusSession {
  apprenantId: string;
  tentativeId: string;
  qcmId: string;
  adresseIp: string | null;
  route: string;
}

/**
 * Verrou de session d'une tentative EN_COURS (US-QCM-10, D3 à D8).
 *
 * `controler` est appelé DANS la transaction de la route, sous un verrou qui
 * sérialise les requêtes de l'apprenant sur cette tentative (inscription au
 * démarrage, ligne de la tentative ailleurs) : deux appareils ne peuvent pas
 * prendre la même tentative en même temps. La décision revient à PostgreSQL
 * (`tentatives_qcm.session_id`, familles de `refresh_tokens`) ; la clé Redis
 * n'est qu'un miroir, et une panne Redis n'est jamais remontée.
 */
@Injectable()
export class TentativeSessionService {
  private readonly logger = new Logger(TentativeSessionService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Autorise, fait adopter (la session courante devient détentrice, écrite
   * dans la transaction) ou refuse. Ne lève rien : le refus est RENVOYÉ et
   * levé après le COMMIT par l'appelant (D5).
   */
  async controler(
    manager: EntityManager,
    tentative: TentativeQcm,
    sessionCourante: string,
    blocageActif: boolean,
  ): Promise<ControleSession> {
    const evaluation = evaluerSession({
      blocageActif,
      sessionTentative: tentative.sessionId,
      sessionCourante,
    });
    const issue: ControleSession =
      evaluation === 'verifier_proprietaire'
        ? trancherSession(await this.sessionOuverte(manager, tentative.sessionId as string))
        : evaluation;
    if (issue === 'adoptee') {
      await manager.update(TentativeQcm, { id: tentative.id }, { sessionId: sessionCourante });
      tentative.sessionId = sessionCourante;
    }
    return issue;
  }

  /**
   * Une session est ouverte tant que sa famille a un refresh token actif et
   * non expiré : la déconnexion, la révocation (rejeu, changement de rôle,
   * compte désactivé) la terminent (D6). Un ancien `jti` n'a pas de famille :
   * il est considéré terminé.
   */
  async sessionOuverte(manager: EntityManager, sessionId: string): Promise<boolean> {
    const [ligne] = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM refresh_tokens
          WHERE famille_id = $1 AND active = true AND date_expiration > clock_timestamp()
       ) AS "ouverte"`,
      [sessionId],
    )) as Array<{ ouverte: boolean }>;
    return ligne?.ouverte === true;
  }

  /** Miroir Redis : expire pile à l'échéance (`PXAT`), comme la minuterie. */
  async armerMiroir(
    apprenantId: string,
    qcmId: string,
    sessionId: string | null,
    dateLimite: Date,
  ): Promise<void> {
    const echeanceMs = new Date(dateLimite).getTime();
    if (sessionId === null || echeanceMs <= Date.now()) return;
    try {
      await this.client.set(cleSessionQcm(apprenantId, qcmId), sessionId, 'PXAT', echeanceMs);
    } catch (erreur) {
      this.signaler('armer', apprenantId, qcmId, erreur);
    }
  }

  /** Supprime le miroir à la clôture (soumission, expiration). Idempotent. */
  async effacerMiroir(apprenantId: string, qcmId: string): Promise<void> {
    try {
      await this.client.del(cleSessionQcm(apprenantId, qcmId));
    } catch (erreur) {
      this.signaler('effacer', apprenantId, qcmId, erreur);
    }
  }

  /**
   * Après le COMMIT : audit SESSION_MULTIPLE_REFUSEE (preuve de fraude, D8),
   * puis 409 `session_active_ailleurs` (D5).
   */
  async refuser(refus: RefusSession): Promise<never> {
    try {
      await this.auditService.record({
        action: 'SESSION_MULTIPLE_REFUSEE',
        acteur: refus.apprenantId,
        cible: refus.tentativeId,
        adresseIp: refus.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: {
          qcmId: refus.qcmId,
          raison: RAISON_SESSION_ACTIVE_AILLEURS,
          route: refus.route,
        },
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(
        `Audit SESSION_MULTIPLE_REFUSEE impossible (cible ${refus.tentativeId}) : ${detail}`,
      );
    }
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: MESSAGE_SESSION_ACTIVE_AILLEURS,
      raison: RAISON_SESSION_ACTIVE_AILLEURS,
    });
  }

  private signaler(operation: string, apprenantId: string, qcmId: string, erreur: unknown): void {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    this.logger.warn(
      `Verrou de session Redis : ${operation} impossible (${apprenantId}, QCM ${qcmId}) : ${detail}`,
    );
  }
}

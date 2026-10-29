import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { cleMinuterie } from './tentative-passage.regles';

/**
 * Minuterie Redis d'une tentative (US-QCM-07, DS-02 : `timer:{tentativeId}`).
 *
 * Décision D1 : c'est `date_limite` (PostgreSQL) qui DÉCIDE ; la clé Redis en
 * est le miroir. Elle expire à l'instant ABSOLU de l'échéance (`PXAT`, en
 * millisecondes depuis l'époque Unix), pas après une durée relative : la
 * réécrire ne rallonge donc jamais le temps, et une clé disparue (redémarrage
 * de Redis, éviction) est simplement recréée à l'identique.
 *
 * Redis n'est pas sur le chemin critique : une panne est journalisée, jamais
 * remontée à l'apprenant — l'échéance en base suffit à protéger le temps.
 */
@Injectable()
export class TentativeMinuterieService {
  private readonly logger = new Logger(TentativeMinuterieService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * Pose (ou repose) la clé, qui expire pile à `dateLimite`. Sans effet si
   * l'échéance est déjà passée : il n'y a plus de minuterie à tenir.
   */
  async armer(tentativeId: string, dateLimite: Date): Promise<void> {
    const echeanceMs = new Date(dateLimite).getTime();
    if (echeanceMs <= Date.now()) return;
    try {
      await this.client.set(cleMinuterie(tentativeId), echeanceMs.toString(), 'PXAT', echeanceMs);
    } catch (erreur) {
      this.signaler('armer', tentativeId, erreur);
    }
  }

  /** Supprime la clé (soumission, expiration). Idempotent. */
  async effacer(tentativeId: string): Promise<void> {
    try {
      await this.client.del(cleMinuterie(tentativeId));
    } catch (erreur) {
      this.signaler('effacer', tentativeId, erreur);
    }
  }

  private signaler(operation: string, tentativeId: string, erreur: unknown): void {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    this.logger.warn(
      `Minuterie Redis : ${operation} impossible (tentative ${tentativeId}) : ${detail}`,
    );
  }
}

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Façade mince au-dessus du client ioredis (US-AUTH-03).
 *
 * Le reste du code (AuthService, futur logout US-AUTH-04, cache/rate-limiting
 * plus tard) ne manipule jamais les commandes Redis brutes : il passe par ces
 * méthodes lisibles. Ça isole la dépendance à ioredis en un seul endroit.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * Écrit une clé avec une durée de vie (TTL) en secondes. Redis supprime
   * la clé tout seul à l'expiration — parfait pour une denylist de jetons :
   * on met le TTL = durée restante du jeton, et l'entrée disparaît pile au
   * moment où le jeton serait de toute façon expiré (pas de ménage à faire).
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** Lit une clé (null si absente ou déjà expirée). */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Vrai si la clé existe encore. Utilisé au refresh pour savoir si un jeton
   * est sur la denylist (révoqué) avant d'émettre un nouvel access token.
   */
  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /** Supprime une clé (idempotent : aucune erreur si elle n'existe pas). */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Ferme proprement la connexion quand l'application s'arrête (hook NestJS).
   * quit() attend que les commandes en cours se terminent avant de couper,
   * contrairement à disconnect() qui coupe net.
   */
  /**
   * Compteur à fenêtre fixe (US-CERT-05, limitation de débit) : INCR puis
   * EXPIRE NX dans une seule transaction — la durée n'est posée qu'à la
   * création de la clé, elle ne se prolonge pas à chaque requête. Renvoie le
   * compte et le temps restant de la fenêtre (secondes).
   */
  async incrementer(
    key: string,
    ttlSeconds: number,
  ): Promise<{ compte: number; resteSecondes: number }> {
    const resultats = await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .ttl(key)
      .exec();
    if (!resultats) throw new Error(`Compteur ${key} : transaction annulée.`);
    for (const [erreur] of resultats) {
      if (erreur) throw erreur;
    }
    const compte = Number(resultats[0][1]);
    const reste = Number(resultats[2][1]);
    return { compte, resteSecondes: reste > 0 ? reste : ttlSeconds };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

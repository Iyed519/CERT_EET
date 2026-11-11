import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../modules/audit/audit.service';
import { LIMITE_REQUETES_KEY } from './limite-requetes.decorator';
import {
  cleLimite,
  LimiteRequetes,
  limiteDepassee,
  MESSAGE_LIMITE_ATTEINTE,
  premierRefusLimite,
} from './limite-requetes.regles';

/**
 * Limitation de débit générique par IP (US-AUTH-06, US-AUTH-13). La limite
 * est lue sur la route (`@AppliquerLimite`) ; sans limite déclarée, la route
 * passe. Au-delà : 429, en-tête Retry-After, et le PREMIER refus de la
 * fenêtre est journalisé (LIMITE_REQUETES_ATTEINTE, avec le nom et la route).
 *
 * Redis injoignable : la route reste ouverte (disponibilité) et l'incident
 * est journalisé dans les logs — même choix que la vérification publique.
 */
@Injectable()
export class LimiteRequetesGuard implements CanActivate {
  private readonly logger = new Logger(LimiteRequetesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limite = this.reflector.getAllAndOverride<LimiteRequetes | undefined>(
      LIMITE_REQUETES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!limite) return true;
    const http = context.switchToHttp();
    const requete = http.getRequest<Request>();

    let compte: number;
    let resteSecondes: number;
    try {
      ({ compte, resteSecondes } = await this.redisService.incrementer(
        cleLimite(limite.nom, requete.ip),
        limite.fenetreSecondes,
      ));
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Limitation de débit « ${limite.nom} » indisponible (Redis) : ${detail}`);
      return true;
    }
    if (!limiteDepassee(compte, limite.limite)) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(resteSecondes));
    if (premierRefusLimite(compte, limite.limite)) {
      try {
        await this.auditService.record({
          action: 'LIMITE_REQUETES_ATTEINTE',
          acteur: null,
          adresseIp: requete.ip ?? null,
          resultat: 'Échec',
          detailsAvantApres: {
            limite: limite.nom,
            maximum: limite.limite,
            fenetreSecondes: limite.fenetreSecondes,
            route: requete.originalUrl,
          },
        });
      } catch (erreur) {
        const detail = erreur instanceof Error ? erreur.message : String(erreur);
        this.logger.error(`Audit LIMITE_REQUETES_ATTEINTE non écrit : ${detail}`);
      }
    }
    throw new HttpException(MESSAGE_LIMITE_ATTEINTE, HttpStatus.TOO_MANY_REQUESTS);
  }
}

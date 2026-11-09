import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { VerificationConfig } from '../../config/configuration';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  cleCompteur,
  depasse,
  FENETRE_SECONDES,
  MESSAGE_TROP_DE_REQUETES,
  premierRefus,
} from './limite-debit.regles';

/**
 * Limitation de débit de la vérification publique (US-CERT-05, DS-05 :
 * « > 20 req/min/IP -> refus »). Compteur Redis à fenêtre fixe par adresse
 * IP (lue derrière nginx grâce à « trust proxy »), commun aux deux routes
 * publiques. Au-delà : 429, en-tête Retry-After, et le PREMIER refus de la
 * fenêtre est tracé (VERIFICATION_LIMITE_ATTEINTE).
 *
 * Redis injoignable : la vérification reste ouverte (disponibilité de la
 * page publique, NF2) et l'incident est journalisé.
 */
@Injectable()
export class LimiteDebitGuard implements CanActivate {
  private readonly logger = new Logger(LimiteDebitGuard.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const requete = http.getRequest<Request>();
    const limite =
      this.configService.getOrThrow<VerificationConfig>('verification').limiteParMinute;

    let compte: number;
    let resteSecondes: number;
    try {
      ({ compte, resteSecondes } = await this.redisService.incrementer(
        cleCompteur(requete.ip),
        FENETRE_SECONDES,
      ));
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Limitation de débit indisponible (Redis) : ${detail}`);
      return true;
    }
    if (!depasse(compte, limite)) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(resteSecondes));
    if (premierRefus(compte, limite)) {
      try {
        await this.auditService.record({
          action: 'VERIFICATION_LIMITE_ATTEINTE',
          acteur: null,
          cible: null,
          adresseIp: requete.ip ?? null,
          resultat: 'Échec',
          detailsAvantApres: { limiteParMinute: limite, route: requete.originalUrl },
        });
      } catch (erreur) {
        const detail = erreur instanceof Error ? erreur.message : String(erreur);
        this.logger.error(`Audit VERIFICATION_LIMITE_ATTEINTE non écrit : ${detail}`);
      }
    }
    throw new HttpException(MESSAGE_TROP_DE_REQUETES, HttpStatus.TOO_MANY_REQUESTS);
  }
}

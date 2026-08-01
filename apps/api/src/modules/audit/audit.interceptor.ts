import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_KEY } from './decorators/audit.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';

/**
 * AuditInterceptor — journalisation générique des routes annotées @Audit
 * (US-AUTH-12). Enregistré globalement (APP_INTERCEPTOR) mais N'AGIT QUE sur
 * les routes portant la métadonnée @Audit : les routes déjà journalisées
 * finement par les services ne sont pas annotées -> aucun double-log.
 *
 * Pour une route annotée : acteur = req.user.sub, IP = req.ip, résultat
 * "Succès" si le handler résout, "Échec" s'il lève. L'écriture d'audit ne doit
 * jamais transformer une réponse réussie en erreur : un échec d'écriture est
 * seulement loggé (best-effort), l'action métier ayant déjà eu lieu.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Route non annotée -> l'intercepteur se retire (aucun audit, aucun coût).
    if (!action) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const acteur = request.user?.sub ?? null;
    const adresseIp = request.ip ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.journaliser(action, acteur, adresseIp, 'Succès');
        },
        error: () => {
          void this.journaliser(action, acteur, adresseIp, 'Échec');
        },
      }),
    );
  }

  /** Écriture best-effort : un échec d'audit ne casse pas la requête. */
  private async journaliser(
    action: string,
    acteur: string | null,
    adresseIp: string | null,
    resultat: 'Succès' | 'Échec',
  ): Promise<void> {
    try {
      await this.auditService.record({ action, acteur, adresseIp, resultat });
    } catch (erreur) {
      this.logger.error(
        `Échec d'écriture d'audit pour l'action ${action}`,
        (erreur as Error).stack,
      );
    }
  }
}

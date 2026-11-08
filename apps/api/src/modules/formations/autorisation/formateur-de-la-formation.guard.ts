import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { Role } from '../../../database/enums/role.enum';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { AutorisationRessourceService, TypeRessource } from './autorisation-ressource.service';
import { FORMATEUR_FORMATION_KEY, SourceFormation } from './formateur-de-la-formation.constants';

/** Message renvoyé quand la ressource demandée n'existe pas. */
const INTROUVABLE: Record<TypeRessource, string> = {
  formation: 'Formation introuvable.',
  module: 'Module introuvable.',
  qcm: 'QCM introuvable.',
  atelier: 'Atelier introuvable.',
};

/**
 * Garde d'autorisation par ressource (US-AUTH-16, ADR-11), posé par
 * @FormateurDeLaFormation. Il s'exécute APRÈS les gardes globaux : la session
 * est déjà vérifiée (JwtAuthGuard) et le rôle aussi (RolesGuard).
 *
 * Ordre volontaire :
 *   1. administrateur -> accès global, aucune lecture en base ;
 *   2. tout autre rôle qu'un formateur -> 403. RolesGuard l'a normalement déjà
 *      refusé ; je le revérifie ici pour qu'un compte rétrogradé qui garde des
 *      lignes d'affectation ne passe jamais, même sur une route sans @Roles ;
 *   3. identifiant de la ressource mal formé -> 400. Un garde passe AVANT les
 *      pipes : ParseUUIDPipe n'a pas encore tourné, et un identifiant invalide
 *      ferait échouer la requête SQL (500) ;
 *   4. ressource inconnue -> 404 ;
 *   5. formateur non affecté à la formation -> audit ACCES_RESSOURCE_REFUSE,
 *      puis 403.
 */
@Injectable()
export class FormateurDeLaFormationGuard implements CanActivate {
  private readonly logger = new Logger(FormateurDeLaFormationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly autorisationService: AutorisationRessourceService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const source = this.reflector.getAllAndOverride<SourceFormation | undefined>(
      FORMATEUR_FORMATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!source) {
      // Erreur de programmation : le garde a été posé sans le décorateur.
      throw new InternalServerErrorException('Autorisation par ressource mal configurée.');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentification requise.');
    }

    if (user.role === Role.ADMINISTRATEUR) {
      return true;
    }
    if (user.role !== Role.FORMATEUR) {
      throw new ForbiddenException('Accès refusé : rôle insuffisant.');
    }

    const [type, nomParametre] = this.lireSource(source);
    const ressourceId = request.params?.[nomParametre];
    if (typeof ressourceId !== 'string' || !isUUID(ressourceId)) {
      throw new BadRequestException(`Identifiant invalide : ${nomParametre} doit être un UUID.`);
    }

    const formationId = await this.autorisationService.formationDe(type, ressourceId);
    if (formationId === null) {
      throw new NotFoundException(INTROUVABLE[type]);
    }

    if (await this.autorisationService.estAffecte(formationId, user.sub)) {
      return true;
    }

    await this.journaliserRefus(request, user.sub, formationId, type, ressourceId);
    throw new ForbiddenException('Accès refusé : vous n’êtes pas affecté à cette formation.');
  }

  /** `{ moduleId: 'id' }` -> ['module', 'id']. */
  private lireSource(source: SourceFormation): [TypeRessource, string] {
    if ('formationId' in source) return ['formation', source.formationId];
    if ('moduleId' in source) return ['module', source.moduleId];
    if ('atelierId' in source) return ['atelier', source.atelierId];
    return ['qcm', source.qcmId];
  }

  /**
   * Trace le refus (NF3). Un échec d'écriture d'audit est consigné mais ne
   * change pas la réponse : la requête doit être refusée dans tous les cas.
   */
  private async journaliserRefus(
    request: AuthenticatedRequest,
    formateurId: string,
    formationId: string,
    type: TypeRessource,
    ressourceId: string,
  ): Promise<void> {
    try {
      await this.auditService.record({
        action: 'ACCES_RESSOURCE_REFUSE',
        acteur: formateurId,
        cible: formationId,
        adresseIp: request.ip ?? null,
        resultat: 'Échec',
        detailsAvantApres: {
          ressource: type,
          ressourceId,
          methode: request.method,
          route: request.originalUrl,
        },
      });
    } catch (erreur) {
      this.logger.error(
        `Échec d'écriture d'audit ACCES_RESSOURCE_REFUSE (formation ${formationId})`,
        (erreur as Error).stack,
      );
    }
  }
}

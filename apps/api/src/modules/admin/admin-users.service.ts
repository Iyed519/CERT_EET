import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { AuthService } from '../auth/auth.service';
import { ChangeRoleDto } from './dto/change-role.dto';

/** Vue admin d'un utilisateur — n'expose JAMAIS le hash du mot de passe. */
export interface UserAdminVue {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  role: Role;
  statut: StatutCompte;
}

// Hash bcrypt factice, comparé quand l'admin n'a pas de mot de passe local
// (compte OAuth) : bcrypt.compare tourne quand même (temps ~constant) et rend
// TOUJOURS faux. Même défense que AuthService.login (anti-oracle de timing).
const FAUX_HASH_BCRYPT =
  '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    // Je réutilise le hook livré en ADR-08-R1 : c'est LE point d'invalidation
    // des sessions après un changement de rôle (ne pas le réimplémenter ici).
    private readonly authService: AuthService,
  ) {}

  /**
   * US-ROL-01 — Liste des utilisateurs pour la console d'administration.
   *
   * Sélection EXPLICITE des colonnes : le hash du mot de passe et le secret MFA
   * ne quittent jamais la base (moindre privilège, ADR-08). Tri par email pour
   * un affichage stable côté frontend.
   */
  async listUsers(): Promise<UserAdminVue[]> {
    return this.userRepository.find({
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        role: true,
        statut: true,
      },
      order: { email: 'ASC' },
    });
  }

  /**
   * US-ROL-01 — Changement de rôle par un administrateur.
   *
   * Ordre volontaire des vérifications :
   *   1. réauthentification de l'admin par mot de passe (step-up) -> 401 si faux ;
   *   2. existence de la cible -> 404 ;
   *   3. rôle déjà appliqué -> 400 (on évite un kill de session + un audit inutiles) ;
   *   4. anti-lockout : refus de rétrograder le DERNIER admin actif -> 403 (US-CPT-03) ;
   *   5. mise à jour du rôle ;
   *   6. invalidation immédiate des sessions de la cible (ADR-08-R1) ;
   *   7. journalisation ROLE_CHANGE (ancien/nouveau, auteur = admin).
   */
  async changeRole(
    adminId: string,
    cibleId: string,
    dto: ChangeRoleDto,
    context: { adresseIp: string | null },
  ): Promise<UserAdminVue> {
    // 1. Réauthentification de l'administrateur (action sensible).
    const admin = await this.userRepository.findOne({ where: { id: adminId } });
    const hashAdmin = admin?.motDePasseHash ?? FAUX_HASH_BCRYPT;
    const motDePasseOk = await bcrypt.compare(dto.motDePasseAdmin, hashAdmin);
    if (!admin || !motDePasseOk) {
      // Une élévation de privilèges tentée avec un mauvais mot de passe est un
      // signal de sécurité : je le journalise avant de rejeter.
      await this.journaliserEchec(adminId, cibleId, context.adresseIp);
      throw new UnauthorizedException('Mot de passe administrateur invalide.');
    }

    // 2. Existence de la cible.
    const cible = await this.userRepository.findOne({ where: { id: cibleId } });
    if (!cible) {
      throw new NotFoundException('Utilisateur cible introuvable.');
    }

    // 3. Rôle déjà appliqué : no-op explicite plutôt qu'une opération vide.
    if (cible.role === dto.nouveauRole) {
      throw new BadRequestException('L\'utilisateur possède déjà ce rôle.');
    }

    // 4. Anti-lockout (US-CPT-03) : on ne rétrograde jamais le dernier
    // administrateur ACTIF, sinon plus personne ne peut administrer la
    // plateforme. Ne concerne que le retrait du rôle ADMINISTRATEUR à un admin
    // actuellement actif.
    const estRetraitAdmin =
      cible.role === Role.ADMINISTRATEUR &&
      dto.nouveauRole !== Role.ADMINISTRATEUR;
    if (estRetraitAdmin && cible.statut === StatutCompte.ACTIF) {
      const adminsActifs = await this.userRepository.count({
        where: { role: Role.ADMINISTRATEUR, statut: StatutCompte.ACTIF },
      });
      if (adminsActifs <= 1) {
        throw new ForbiddenException(
          'Impossible de rétrograder le dernier administrateur actif.',
        );
      }
    }

    // 5. Mise à jour du rôle (on conserve l'ancien pour l'audit).
    const ancienRole = cible.role;
    cible.role = dto.nouveauRole;
    await this.userRepository.save(cible);

    // 6. Invalidation immédiate des sessions de la cible : le nouveau rôle doit
    // s'appliquer TOUT DE SUITE. Un access token portant l'ancien rôle sera
    // refusé au prochain appel (ADR-08-R1).
    await this.authService.invalidateUserSessions(cible.id);

    // 7. Audit ROLE_CHANGE : qui a changé quoi, ancien -> nouveau (US-ROL-01).
    const audit = this.auditLogRepository.create({
      userId: adminId, // auteur de l'action
      action: 'ROLE_CHANGE',
      cible: cible.id, // utilisateur impacté
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        cibleEmail: cible.email,
        ancienRole,
        nouveauRole: dto.nouveauRole,
      },
    });
    await this.auditLogRepository.save(audit);

    return {
      id: cible.id,
      email: cible.email,
      nom: cible.nom,
      prenom: cible.prenom,
      role: cible.role,
      statut: cible.statut,
    };
  }

  /** Journalise une tentative de changement de rôle au mot de passe admin erroné. */
  private async journaliserEchec(
    adminId: string,
    cibleId: string,
    adresseIp: string | null,
  ): Promise<void> {
    const audit = this.auditLogRepository.create({
      userId: adminId,
      action: 'ROLE_CHANGE',
      cible: cibleId,
      adresseIp,
      resultat: 'Échec',
      detailsAvantApres: { motif: 'Mot de passe administrateur invalide' },
    });
    await this.auditLogRepository.save(audit);
  }
}

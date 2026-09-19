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
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
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
    // US-AUTH-12 : writer d'audit UNIQUE (AuditModule @Global). Je n'injecte
    // plus le repository AuditLog ici — toute trace passe par AuditService.
    private readonly auditService: AuditService,
    // Je réutilise le hook livré en ADR-08-R1 : c'est LE point d'invalidation
    // des sessions après un changement de rôle ou une désactivation (ne pas le
    // réimplémenter ici).
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
   *   4. anti-lockout : refus de rétrograder le DERNIER admin actif -> 403 ;
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
    // 1. Réauthentification de l'administrateur (action sensible, step-up auth).
    // C'est la SEULE différence avec l'approbation d'une demande (US-ROL-02),
    // où l'admin est déjà authentifié par sa session -> aucun mot de passe.
    const admin = await this.userRepository.findOne({ where: { id: adminId } });
    const hashAdmin = admin?.motDePasseHash ?? FAUX_HASH_BCRYPT;
    const motDePasseOk = await bcrypt.compare(dto.motDePasseAdmin, hashAdmin);
    if (!admin || !motDePasseOk) {
      // Une élévation de privilèges tentée avec un mauvais mot de passe est un
      // signal de sécurité : je le journalise avant de rejeter.
      await this.journaliserEchec(adminId, cibleId, context.adresseIp);
      throw new UnauthorizedException('Mot de passe administrateur invalide.');
    }

    // 2. Mot de passe validé -> on applique le cœur du changement de rôle.
    return this.appliquerChangementRole(
      adminId,
      cibleId,
      dto.nouveauRole,
      context,
    );
  }

  /**
   * Cœur du changement de rôle — brique PARTAGÉE (US-ROL-01 nomination directe
   * et US-ROL-02 approbation d'une demande). SANS step-up mot de passe :
   * l'appelant a déjà authentifié l'administrateur (session valide ; pour ROL-01
   * en plus son mot de passe). C'est ICI, et nulle part ailleurs, qu'est émis
   * l'audit `ROLE_CHANGE` -> l'approbation d'une demande ne doit PAS le
   * ré-émettre (sinon double trace pour une seule décision).
   *
   * Ordre volontaire des vérifications :
   *   1. existence de la cible -> 404 ;
   *   2. rôle déjà appliqué -> 400 (on évite un kill de session + un audit inutiles) ;
   *   3. anti-lockout : refus de rétrograder le DERNIER admin actif -> 403 ;
   *   4. mise à jour du rôle ;
   *   5. invalidation immédiate des sessions de la cible (ADR-08-R1) ;
   *   6. journalisation ROLE_CHANGE (ancien/nouveau, auteur = admin).
   */
  async appliquerChangementRole(
    adminId: string,
    cibleId: string,
    nouveauRole: Role,
    context: { adresseIp: string | null },
  ): Promise<UserAdminVue> {
    // 1. Existence de la cible.
    const cible = await this.userRepository.findOne({ where: { id: cibleId } });
    if (!cible) {
      throw new NotFoundException('Utilisateur cible introuvable.');
    }

    // 2. Rôle déjà appliqué : no-op explicite plutôt qu'une opération vide.
    if (cible.role === nouveauRole) {
      throw new BadRequestException('L\'utilisateur possède déjà ce rôle.');
    }

    // 3. Anti-lockout : on ne rétrograde jamais le dernier administrateur ACTIF.
    // Ne concerne que le RETRAIT du rôle ADMINISTRATEUR à un admin actif ; une
    // montée en rôle (cas nominal d'US-ROL-02) ne déclenche donc jamais ce
    // garde-fou, mais la logique héritée reste intacte.
    const estRetraitAdmin =
      cible.role === Role.ADMINISTRATEUR && nouveauRole !== Role.ADMINISTRATEUR;
    if (
      estRetraitAdmin &&
      cible.statut === StatutCompte.ACTIF &&
      (await this.compterAdminsActifs()) <= 1
    ) {
      throw new ForbiddenException(
        'Impossible de rétrograder le dernier administrateur actif.',
      );
    }

    // 4. Mise à jour du rôle (on conserve l'ancien pour l'audit).
    const ancienRole = cible.role;
    cible.role = nouveauRole;
    await this.userRepository.save(cible);

    // 5. Invalidation immédiate des sessions de la cible : le nouveau rôle doit
    // s'appliquer TOUT DE SUITE (ADR-08-R1).
    await this.authService.invalidateUserSessions(cible.id);

    // 6. Audit ROLE_CHANGE : qui a changé quoi, ancien -> nouveau.
    await this.auditService.record({
      action: 'ROLE_CHANGE',
      acteur: adminId,
      cible: cible.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        cibleEmail: cible.email,
        ancienRole,
        nouveauRole,
      },
    });

    return this.toVue(cible);
  }

  /**
   * US-CPT-03 — Désactivation (bannissement) d'un compte par un administrateur.
   *
   * Ordre volontaire des vérifications (aucune écriture avant que TOUT soit
   * validé) :
   *   1. existence de la cible -> 404 ;
   *   2. déjà désactivé -> 400 (no-op explicite) ;
   *   3. anti-lockout : refus de désactiver le DERNIER admin actif -> 403,
   *      AVANT toute écriture ;
   *   4. passage à DESACTIVE ;
   *   5. invalidation immédiate des sessions de la cible (le compte banni doit
   *      perdre l'accès sur-le-champ, ADR-08-R1) ;
   *   6. audit COMPTE_DESACTIVE, le motif étant tracé dans detailsAvantApres.
   */
  async desactiverCompte(
    adminId: string,
    cibleId: string,
    motif: string,
    context: { adresseIp: string | null },
  ): Promise<UserAdminVue> {
    // 1. Existence de la cible.
    const cible = await this.userRepository.findOne({ where: { id: cibleId } });
    if (!cible) {
      throw new NotFoundException('Utilisateur cible introuvable.');
    }

    // 2. Déjà désactivé : on évite un kill de session + un audit inutiles.
    if (cible.statut === StatutCompte.DESACTIVE) {
      throw new BadRequestException('Le compte est déjà désactivé.');
    }

    // 3. Anti-lockout : désactiver le dernier administrateur ACTIF le
    // verrouillerait hors de la plateforme. Vérifié AVANT toute écriture ->
    // sur 403, rien n'est modifié (même socle que changeRole, US-ROL-01).
    if (
      cible.role === Role.ADMINISTRATEUR &&
      cible.statut === StatutCompte.ACTIF &&
      (await this.compterAdminsActifs()) <= 1
    ) {
      throw new ForbiddenException(
        'Il doit rester au moins un administrateur actif.',
      );
    }

    // 4. Passage à DESACTIVE (on conserve l'ancien statut pour l'audit).
    const ancienStatut = cible.statut;
    cible.statut = StatutCompte.DESACTIVE;
    await this.userRepository.save(cible);

    // 5. Invalidation immédiate : le login refuse déjà tout statut != ACTIF,
    // mais une session déjà ouverte doit être coupée SANS attendre l'expiration
    // de l'access token (ADR-08-R1).
    await this.authService.invalidateUserSessions(cible.id);

    // 6. Audit COMPTE_DESACTIVE : le motif est la trace de la décision.
    await this.auditService.record({
      action: 'COMPTE_DESACTIVE',
      acteur: adminId,
      cible: cible.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        cibleEmail: cible.email,
        ancienStatut,
        nouveauStatut: StatutCompte.DESACTIVE,
        motif,
      },
    });

    return this.toVue(cible);
  }

  /**
   * US-CPT-03 — Réactivation d'un compte désactivé par un administrateur.
   *
   *   1. existence de la cible -> 404 ;
   *   2. déjà actif -> 400 (no-op explicite) ;
   *   3. passage à ACTIF ;
   *   4. audit COMPTE_REACTIVE (pas de motif requis).
   *
   * Pas d'invalidation de sessions : un compte désactivé n'a plus de session
   * active à couper, et la réactivation ne doit rien révoquer.
   */
  async reactiverCompte(
    adminId: string,
    cibleId: string,
    context: { adresseIp: string | null },
  ): Promise<UserAdminVue> {
    // 1. Existence de la cible.
    const cible = await this.userRepository.findOne({ where: { id: cibleId } });
    if (!cible) {
      throw new NotFoundException('Utilisateur cible introuvable.');
    }

    // 2. Déjà actif : rien à faire.
    if (cible.statut === StatutCompte.ACTIF) {
      throw new BadRequestException('Le compte est déjà actif.');
    }

    // 3. Passage à ACTIF (on conserve l'ancien statut pour l'audit).
    const ancienStatut = cible.statut;
    cible.statut = StatutCompte.ACTIF;
    await this.userRepository.save(cible);

    // 4. Audit COMPTE_REACTIVE.
    await this.auditService.record({
      action: 'COMPTE_REACTIVE',
      acteur: adminId,
      cible: cible.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        cibleEmail: cible.email,
        ancienStatut,
        nouveauStatut: StatutCompte.ACTIF,
      },
    });

    return this.toVue(cible);
  }

  /**
   * Anti-lockout (brique partagée US-ROL-01 / US-CPT-03) : nombre
   * d'administrateurs actuellement ACTIF. Un retrait de rôle ou une
   * désactivation qui ferait tomber ce compte à zéro est refusé (403).
   */
  private async compterAdminsActifs(): Promise<number> {
    return this.userRepository.count({
      where: { role: Role.ADMINISTRATEUR, statut: StatutCompte.ACTIF },
    });
  }

  /** Projette une entité User vers la vue admin (jamais le hash / le secret MFA). */
  private toVue(user: User): UserAdminVue {
    return {
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      statut: user.statut,
    };
  }

  /** Journalise une tentative de changement de rôle au mot de passe admin erroné. */
  private async journaliserEchec(
    adminId: string,
    cibleId: string,
    adresseIp: string | null,
  ): Promise<void> {
    await this.auditService.record({
      action: 'ROLE_CHANGE',
      acteur: adminId,
      cible: cibleId,
      adresseIp,
      resultat: 'Échec',
      detailsAvantApres: { motif: 'Mot de passe administrateur invalide' },
    });
  }
}

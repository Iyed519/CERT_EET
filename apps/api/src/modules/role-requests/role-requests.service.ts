import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DemandeRole } from '../../database/entities/demande-role.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/enums/role.enum';
import { RoleDemande } from '../../database/enums/role-demande.enum';
import { StatutDemande } from '../../database/enums/statut-demande.enum';
import { AuditService } from '../audit/audit.service';
import { AdminUsersService } from '../admin/admin-users.service';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';
import { ListRoleRequestsDto } from './dto/list-role-requests.dto';

/**
 * Vue d'une demande renvoyée à son AUTEUR (US-ROL-02). N'expose que les champs
 * utiles côté utilisateur — jamais de données d'un autre compte.
 */
export interface DemandeRoleVue {
  id: string;
  roleDemande: RoleDemande;
  justification: string;
  statut: StatutDemande;
  motif: string | null;
  traiteAt: Date | null;
  createdAt: Date;
}

/** Identité minimale du demandeur, jointe pour la console admin. */
export interface Demandeur {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
}

/**
 * Vue ADMIN d'une demande (US-ROL-02, étape C) : enrichie de l'identité du
 * demandeur et de la traçabilité du traitement (traitePar/traiteAt).
 */
export interface DemandeRoleAdminVue extends DemandeRoleVue {
  demandeur: Demandeur;
  traitePar: string | null;
}

/** Réponse paginée de la console admin (même forme que GET /admin/audit-logs). */
export interface DemandeRolePage {
  items: DemandeRoleAdminVue[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class RoleRequestsService {
  constructor(
    @InjectRepository(DemandeRole)
    private readonly demandeRepository: Repository<DemandeRole>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12) : le rejet est tracé ici.
    // L'approbation, elle, est tracée par le cœur ROL-01 (ROLE_CHANGE) — je ne
    // ré-émets JAMAIS d'audit de rôle côté approbation.
    private readonly auditService: AuditService,
    // Cœur PARTAGÉ du changement de rôle (US-ROL-01) : je le réutilise à
    // l'approbation au lieu de le réimplémenter (maj rôle + invalidation des
    // sessions + audit ROLE_CHANGE + anti-lockout, SANS step-up mot de passe).
    private readonly adminUsersService: AdminUsersService,
  ) {}

  // ===================================================================
  //  Côté utilisateur (étape B)
  // ===================================================================

  /**
   * US-ROL-02 (création) — Un utilisateur authentifié soumet une demande.
   *
   * Ordre volontaire (aucune écriture avant validation complète) :
   *   1. existence de l'auteur -> 404 (filet ; le JwtAuthGuard garantit déjà
   *      une session valide) ;
   *   2. rôle déjà détenu -> 400 (comparaison textuelle Role vs RoleDemande) ;
   *   3. demande déjà EN_ATTENTE -> 409 (une seule en cours à la fois) ;
   *   4. création au statut EN_ATTENTE.
   */
  async creer(
    userId: string,
    dto: CreateRoleRequestDto,
  ): Promise<DemandeRoleVue> {
    const auteur = await this.userRepository.findOne({ where: { id: userId } });
    if (!auteur) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    if ((auteur.role as string) === (dto.roleDemande as string)) {
      throw new BadRequestException('Vous possédez déjà ce rôle.');
    }

    const enAttente = await this.demandeRepository.findOne({
      where: { userId, statut: StatutDemande.EN_ATTENTE },
    });
    if (enAttente) {
      throw new ConflictException(
        'Vous avez déjà une demande de changement de rôle en attente.',
      );
    }

    const demande = this.demandeRepository.create({
      userId,
      roleDemande: dto.roleDemande,
      justification: dto.justification,
      statut: StatutDemande.EN_ATTENTE,
    });
    const enregistree = await this.demandeRepository.save(demande);
    return this.toVue(enregistree);
  }

  /**
   * US-ROL-02 (consultation) — L'utilisateur liste SES propres demandes, la
   * plus récente d'abord. Filtré sur son userId : il ne voit jamais celles
   * d'un autre compte.
   */
  async listerMes(userId: string): Promise<DemandeRoleVue[]> {
    const demandes = await this.demandeRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return demandes.map((d) => this.toVue(d));
  }

  // ===================================================================
  //  Côté administrateur (étape C)
  // ===================================================================

  /**
   * US-ROL-02 (admin) — File des demandes, filtrable par statut, paginée, tri
   * createdAt DESC. Deux requêtes plutôt qu'une jointure : je pagine d'abord
   * les demandes, puis je charge en un seul SELECT l'identité des demandeurs
   * concernés (In(userIds)) — DemandeRole ne porte pas de relation ManyToOne,
   * seulement une FK, ce que je conserve.
   */
  async listerAdmin(query: ListRoleRequestsDto): Promise<DemandeRolePage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [demandes, total] = await this.demandeRepository.findAndCount({
      where: query.statut ? { statut: query.statut } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const demandeurs = await this.chargerDemandeurs(
      demandes.map((d) => d.userId),
    );
    const items = demandes.map((d) =>
      this.toAdminVue(d, demandeurs.get(d.userId)),
    );
    return { items, total, page, limit };
  }

  /**
   * US-ROL-02 (admin) — Approbation.
   *
   *   1. existence de la demande -> 404 ;
   *   2. déjà traitée (APPROUVEE/REJETEE) -> 409 (état terminal, non rejouable) ;
   *   3. application du cœur ROL-01 (maj rôle + invalidation + audit ROLE_CHANGE
   *      + anti-lockout, SANS step-up) — c'est LUI qui émet l'audit du rôle ;
   *   4. passage de la demande à APPROUVEE (+ traitePar, traiteAt).
   *
   * Pas de second audit ici : l'unique trace de la décision de rôle est le
   * ROLE_CHANGE émis par le cœur (évite la double journalisation).
   */
  async approuver(
    adminId: string,
    demandeId: string,
    context: { adresseIp: string | null },
  ): Promise<DemandeRoleAdminVue> {
    const demande = await this.chargerEnAttente(demandeId);

    // Applique le changement de rôle (émet ROLE_CHANGE). Une montée en rôle ne
    // déclenche jamais l'anti-lockout ; un éventuel 400/404 du cœur remonte tel
    // quel et la demande reste EN_ATTENTE (rien n'est marqué traité).
    await this.adminUsersService.appliquerChangementRole(
      adminId,
      demande.userId,
      this.versRole(demande.roleDemande),
      context,
    );

    demande.statut = StatutDemande.APPROUVEE;
    demande.traitePar = adminId;
    demande.traiteAt = new Date();
    const maj = await this.demandeRepository.save(demande);

    return this.toAdminVueAvecUser(maj);
  }

  /**
   * US-ROL-02 (admin) — Rejet motivé.
   *
   *   1. existence de la demande -> 404 ;
   *   2. déjà traitée -> 409 ;
   *   3. passage à REJETEE (+ motif, traitePar, traiteAt) ;
   *   4. audit DEMANDE_ROLE_TRAITEE (décision = rejet, motif tracé).
   *
   * Aucun changement de rôle : le rejet ne touche pas le compte cible.
   */
  async rejeter(
    adminId: string,
    demandeId: string,
    motif: string,
    context: { adresseIp: string | null },
  ): Promise<DemandeRoleAdminVue> {
    const demande = await this.chargerEnAttente(demandeId);

    demande.statut = StatutDemande.REJETEE;
    demande.motif = motif;
    demande.traitePar = adminId;
    demande.traiteAt = new Date();
    const maj = await this.demandeRepository.save(demande);

    await this.auditService.record({
      action: 'DEMANDE_ROLE_TRAITEE',
      acteur: adminId,
      cible: maj.userId,
      adresseIp: context.adresseIp,
      resultat: 'Rejet',
      detailsAvantApres: {
        demandeId: maj.id,
        roleDemande: maj.roleDemande,
        decision: StatutDemande.REJETEE,
        motif,
      },
    });

    return this.toAdminVueAvecUser(maj);
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /** Charge une demande et garantit qu'elle est encore EN_ATTENTE (404 / 409). */
  private async chargerEnAttente(demandeId: string): Promise<DemandeRole> {
    const demande = await this.demandeRepository.findOne({
      where: { id: demandeId },
    });
    if (!demande) {
      throw new NotFoundException('Demande de changement de rôle introuvable.');
    }
    if (demande.statut !== StatutDemande.EN_ATTENTE) {
      throw new ConflictException('Cette demande a déjà été traitée.');
    }
    return demande;
  }

  /** Charge l'identité (email/nom/prénom) des demandeurs, indexée par id. */
  private async chargerDemandeurs(
    userIds: string[],
  ): Promise<Map<string, Demandeur>> {
    const uniques = [...new Set(userIds)];
    if (uniques.length === 0) {
      return new Map();
    }
    const users = await this.userRepository.find({
      where: { id: In(uniques) },
      select: { id: true, email: true, nom: true, prenom: true },
    });
    return new Map(users.map((u) => [u.id, u as Demandeur]));
  }

  /** Convertit le rôle DEMANDÉ (enum restreint) vers le rôle système `Role`. */
  private versRole(roleDemande: RoleDemande): Role {
    return roleDemande === RoleDemande.ADMINISTRATEUR
      ? Role.ADMINISTRATEUR
      : Role.FORMATEUR;
  }

  /** Vue utilisateur (auteur). */
  private toVue(demande: DemandeRole): DemandeRoleVue {
    return {
      id: demande.id,
      roleDemande: demande.roleDemande,
      justification: demande.justification,
      statut: demande.statut,
      motif: demande.motif,
      traiteAt: demande.traiteAt,
      createdAt: demande.createdAt,
    };
  }

  /** Vue admin (auteur + identité du demandeur + traçabilité). */
  private toAdminVue(
    demande: DemandeRole,
    demandeur?: Demandeur,
  ): DemandeRoleAdminVue {
    return {
      ...this.toVue(demande),
      traitePar: demande.traitePar,
      demandeur: demandeur ?? {
        id: demande.userId,
        email: '',
        nom: null,
        prenom: null,
      },
    };
  }

  /** Vue admin d'UNE demande, en chargeant son demandeur (approve/reject). */
  private async toAdminVueAvecUser(
    demande: DemandeRole,
  ): Promise<DemandeRoleAdminVue> {
    const demandeurs = await this.chargerDemandeurs([demande.userId]);
    return this.toAdminVue(demande, demandeurs.get(demande.userId));
  }
}

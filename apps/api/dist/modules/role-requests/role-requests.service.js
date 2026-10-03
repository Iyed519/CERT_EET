"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleRequestsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const demande_role_entity_1 = require("../../database/entities/demande-role.entity");
const user_entity_1 = require("../../database/entities/user.entity");
const role_enum_1 = require("../../database/enums/role.enum");
const role_demande_enum_1 = require("../../database/enums/role-demande.enum");
const statut_demande_enum_1 = require("../../database/enums/statut-demande.enum");
const audit_service_1 = require("../audit/audit.service");
const admin_users_service_1 = require("../admin/admin-users.service");
let RoleRequestsService = class RoleRequestsService {
    constructor(demandeRepository, userRepository, auditService, adminUsersService) {
        this.demandeRepository = demandeRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.adminUsersService = adminUsersService;
    }
    async creer(userId, dto) {
        const auteur = await this.userRepository.findOne({ where: { id: userId } });
        if (!auteur) {
            throw new common_1.NotFoundException('Utilisateur introuvable.');
        }
        if (auteur.role === dto.roleDemande) {
            throw new common_1.BadRequestException('Vous possédez déjà ce rôle.');
        }
        const enAttente = await this.demandeRepository.findOne({
            where: { userId, statut: statut_demande_enum_1.StatutDemande.EN_ATTENTE },
        });
        if (enAttente) {
            throw new common_1.ConflictException('Vous avez déjà une demande de changement de rôle en attente.');
        }
        const demande = this.demandeRepository.create({
            userId,
            roleDemande: dto.roleDemande,
            justification: dto.justification,
            statut: statut_demande_enum_1.StatutDemande.EN_ATTENTE,
        });
        const enregistree = await this.demandeRepository.save(demande);
        return this.toVue(enregistree);
    }
    async listerMes(userId) {
        const demandes = await this.demandeRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
        return demandes.map((d) => this.toVue(d));
    }
    async listerAdmin(query) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const [demandes, total] = await this.demandeRepository.findAndCount({
            where: query.statut ? { statut: query.statut } : {},
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        const demandeurs = await this.chargerDemandeurs(demandes.map((d) => d.userId));
        const items = demandes.map((d) => this.toAdminVue(d, demandeurs.get(d.userId)));
        return { items, total, page, limit };
    }
    async approuver(adminId, demandeId, context) {
        const demande = await this.chargerEnAttente(demandeId);
        await this.adminUsersService.appliquerChangementRole(adminId, demande.userId, this.versRole(demande.roleDemande), context);
        demande.statut = statut_demande_enum_1.StatutDemande.APPROUVEE;
        demande.traitePar = adminId;
        demande.traiteAt = new Date();
        const maj = await this.demandeRepository.save(demande);
        return this.toAdminVueAvecUser(maj);
    }
    async rejeter(adminId, demandeId, motif, context) {
        const demande = await this.chargerEnAttente(demandeId);
        demande.statut = statut_demande_enum_1.StatutDemande.REJETEE;
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
                decision: statut_demande_enum_1.StatutDemande.REJETEE,
                motif,
            },
        });
        return this.toAdminVueAvecUser(maj);
    }
    async chargerEnAttente(demandeId) {
        const demande = await this.demandeRepository.findOne({
            where: { id: demandeId },
        });
        if (!demande) {
            throw new common_1.NotFoundException('Demande de changement de rôle introuvable.');
        }
        if (demande.statut !== statut_demande_enum_1.StatutDemande.EN_ATTENTE) {
            throw new common_1.ConflictException('Cette demande a déjà été traitée.');
        }
        return demande;
    }
    async chargerDemandeurs(userIds) {
        const uniques = [...new Set(userIds)];
        if (uniques.length === 0) {
            return new Map();
        }
        const users = await this.userRepository.find({
            where: { id: (0, typeorm_2.In)(uniques) },
            select: { id: true, email: true, nom: true, prenom: true },
        });
        return new Map(users.map((u) => [u.id, u]));
    }
    versRole(roleDemande) {
        return roleDemande === role_demande_enum_1.RoleDemande.ADMINISTRATEUR
            ? role_enum_1.Role.ADMINISTRATEUR
            : role_enum_1.Role.FORMATEUR;
    }
    toVue(demande) {
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
    toAdminVue(demande, demandeur) {
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
    async toAdminVueAvecUser(demande) {
        const demandeurs = await this.chargerDemandeurs([demande.userId]);
        return this.toAdminVue(demande, demandeurs.get(demande.userId));
    }
};
exports.RoleRequestsService = RoleRequestsService;
exports.RoleRequestsService = RoleRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(demande_role_entity_1.DemandeRole)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        audit_service_1.AuditService,
        admin_users_service_1.AdminUsersService])
], RoleRequestsService);
//# sourceMappingURL=role-requests.service.js.map
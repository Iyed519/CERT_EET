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
exports.AdminUsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = require("bcryptjs");
const user_entity_1 = require("../../database/entities/user.entity");
const role_enum_1 = require("../../database/enums/role.enum");
const statut_compte_enum_1 = require("../../database/enums/statut-compte.enum");
const auth_service_1 = require("../auth/auth.service");
const audit_service_1 = require("../audit/audit.service");
const FAUX_HASH_BCRYPT = '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';
let AdminUsersService = class AdminUsersService {
    constructor(userRepository, auditService, authService) {
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.authService = authService;
    }
    async listUsers() {
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
    async changeRole(adminId, cibleId, dto, context) {
        const admin = await this.userRepository.findOne({ where: { id: adminId } });
        const hashAdmin = admin?.motDePasseHash ?? FAUX_HASH_BCRYPT;
        const motDePasseOk = await bcrypt.compare(dto.motDePasseAdmin, hashAdmin);
        if (!admin || !motDePasseOk) {
            await this.journaliserEchec(adminId, cibleId, context.adresseIp);
            throw new common_1.UnauthorizedException('Mot de passe administrateur invalide.');
        }
        return this.appliquerChangementRole(adminId, cibleId, dto.nouveauRole, context);
    }
    async appliquerChangementRole(adminId, cibleId, nouveauRole, context) {
        const cible = await this.userRepository.findOne({ where: { id: cibleId } });
        if (!cible) {
            throw new common_1.NotFoundException('Utilisateur cible introuvable.');
        }
        if (cible.role === nouveauRole) {
            throw new common_1.BadRequestException('L\'utilisateur possède déjà ce rôle.');
        }
        const estRetraitAdmin = cible.role === role_enum_1.Role.ADMINISTRATEUR && nouveauRole !== role_enum_1.Role.ADMINISTRATEUR;
        if (estRetraitAdmin &&
            cible.statut === statut_compte_enum_1.StatutCompte.ACTIF &&
            (await this.compterAdminsActifs()) <= 1) {
            throw new common_1.ForbiddenException('Impossible de rétrograder le dernier administrateur actif.');
        }
        const ancienRole = cible.role;
        cible.role = nouveauRole;
        await this.userRepository.save(cible);
        await this.authService.invalidateUserSessions(cible.id);
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
    async desactiverCompte(adminId, cibleId, motif, context) {
        const cible = await this.userRepository.findOne({ where: { id: cibleId } });
        if (!cible) {
            throw new common_1.NotFoundException('Utilisateur cible introuvable.');
        }
        if (cible.statut === statut_compte_enum_1.StatutCompte.DESACTIVE) {
            throw new common_1.BadRequestException('Le compte est déjà désactivé.');
        }
        if (cible.role === role_enum_1.Role.ADMINISTRATEUR &&
            cible.statut === statut_compte_enum_1.StatutCompte.ACTIF &&
            (await this.compterAdminsActifs()) <= 1) {
            throw new common_1.ForbiddenException('Il doit rester au moins un administrateur actif.');
        }
        const ancienStatut = cible.statut;
        cible.statut = statut_compte_enum_1.StatutCompte.DESACTIVE;
        await this.userRepository.save(cible);
        await this.authService.invalidateUserSessions(cible.id);
        await this.auditService.record({
            action: 'COMPTE_DESACTIVE',
            acteur: adminId,
            cible: cible.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
            detailsAvantApres: {
                cibleEmail: cible.email,
                ancienStatut,
                nouveauStatut: statut_compte_enum_1.StatutCompte.DESACTIVE,
                motif,
            },
        });
        return this.toVue(cible);
    }
    async reactiverCompte(adminId, cibleId, context) {
        const cible = await this.userRepository.findOne({ where: { id: cibleId } });
        if (!cible) {
            throw new common_1.NotFoundException('Utilisateur cible introuvable.');
        }
        if (cible.statut === statut_compte_enum_1.StatutCompte.ACTIF) {
            throw new common_1.BadRequestException('Le compte est déjà actif.');
        }
        const ancienStatut = cible.statut;
        cible.statut = statut_compte_enum_1.StatutCompte.ACTIF;
        await this.userRepository.save(cible);
        await this.auditService.record({
            action: 'COMPTE_REACTIVE',
            acteur: adminId,
            cible: cible.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
            detailsAvantApres: {
                cibleEmail: cible.email,
                ancienStatut,
                nouveauStatut: statut_compte_enum_1.StatutCompte.ACTIF,
            },
        });
        return this.toVue(cible);
    }
    async compterAdminsActifs() {
        return this.userRepository.count({
            where: { role: role_enum_1.Role.ADMINISTRATEUR, statut: statut_compte_enum_1.StatutCompte.ACTIF },
        });
    }
    toVue(user) {
        return {
            id: user.id,
            email: user.email,
            nom: user.nom,
            prenom: user.prenom,
            role: user.role,
            statut: user.statut,
        };
    }
    async journaliserEchec(adminId, cibleId, adresseIp) {
        await this.auditService.record({
            action: 'ROLE_CHANGE',
            acteur: adminId,
            cible: cibleId,
            adresseIp,
            resultat: 'Échec',
            detailsAvantApres: { motif: 'Mot de passe administrateur invalide' },
        });
    }
};
exports.AdminUsersService = AdminUsersService;
exports.AdminUsersService = AdminUsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        audit_service_1.AuditService,
        auth_service_1.AuthService])
], AdminUsersService);
//# sourceMappingURL=admin-users.service.js.map
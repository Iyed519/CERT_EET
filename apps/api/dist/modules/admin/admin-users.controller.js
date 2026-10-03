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
exports.AdminUsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const role_enum_1 = require("../../database/enums/role.enum");
const statut_compte_enum_1 = require("../../database/enums/statut-compte.enum");
const admin_users_service_1 = require("./admin-users.service");
const change_role_dto_1 = require("./dto/change-role.dto");
const change_statut_dto_1 = require("./dto/change-statut.dto");
let AdminUsersController = class AdminUsersController {
    constructor(adminUsersService) {
        this.adminUsersService = adminUsersService;
    }
    listUsers() {
        return this.adminUsersService.listUsers();
    }
    async changeRole(cibleId, dto, req) {
        const admin = req.user;
        if (!admin) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.adminUsersService.changeRole(admin.sub, cibleId, dto, {
            adresseIp: req.ip ?? null,
        });
    }
    async changeStatut(cibleId, dto, req) {
        const admin = req.user;
        if (!admin) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        const context = { adresseIp: req.ip ?? null };
        if (dto.statut === statut_compte_enum_1.StatutCompte.DESACTIVE) {
            return this.adminUsersService.desactiverCompte(admin.sub, cibleId, dto.motif ?? '', context);
        }
        return this.adminUsersService.reactiverCompte(admin.sub, cibleId, context);
    }
};
exports.AdminUsersController = AdminUsersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les utilisateurs (US-ROL-01)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Utilisateurs triés par email.' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Changer le rôle d\'un utilisateur (US-ROL-01)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Rôle mis à jour ; sessions de la cible invalidées.',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'L\'utilisateur possède déjà ce rôle.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Mot de passe administrateur invalide.' }),
    (0, swagger_1.ApiResponse)({
        status: 403,
        description: 'Dernier administrateur actif : rétrogradation refusée.',
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Utilisateur cible introuvable.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, change_role_dto_1.ChangeRoleDto, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "changeRole", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Activer / désactiver un compte (US-CPT-03)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Statut du compte mis à jour.' }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Motif manquant, ou statut déjà appliqué.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 403,
        description: 'Dernier administrateur actif : désactivation refusée.',
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Utilisateur cible introuvable.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, change_statut_dto_1.ChangeStatutDto, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "changeStatut", null);
exports.AdminUsersController = AdminUsersController = __decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiTags)('admin'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMINISTRATEUR),
    (0, common_1.Controller)('admin/users'),
    __metadata("design:paramtypes", [admin_users_service_1.AdminUsersService])
], AdminUsersController);
//# sourceMappingURL=admin-users.controller.js.map
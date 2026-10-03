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
exports.AdminRoleRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const role_enum_1 = require("../../database/enums/role.enum");
const role_requests_service_1 = require("./role-requests.service");
const list_role_requests_dto_1 = require("./dto/list-role-requests.dto");
const reject_role_request_dto_1 = require("./dto/reject-role-request.dto");
let AdminRoleRequestsController = class AdminRoleRequestsController {
    constructor(roleRequestsService) {
        this.roleRequestsService = roleRequestsService;
    }
    list(query) {
        return this.roleRequestsService.listerAdmin(query);
    }
    async approuver(id, req) {
        const admin = req.user;
        if (!admin) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.roleRequestsService.approuver(admin.sub, id, {
            adresseIp: req.ip ?? null,
        });
    }
    async rejeter(id, dto, req) {
        const admin = req.user;
        if (!admin) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.roleRequestsService.rejeter(admin.sub, id, dto.motif, {
            adresseIp: req.ip ?? null,
        });
    }
};
exports.AdminRoleRequestsController = AdminRoleRequestsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lister les demandes de rôle (US-ROL-02)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Demandes paginées { items, total, page, limit }, tri DESC.',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Filtre invalide (statut, page…).' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_role_requests_dto_1.ListRoleRequestsDto]),
    __metadata("design:returntype", Promise)
], AdminRoleRequestsController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id/approve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Approuver une demande de rôle (US-ROL-02)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Rôle appliqué + sessions cible invalidées ; demande APPROUVEE.',
    }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Demande introuvable.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Demande déjà traitée.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminRoleRequestsController.prototype, "approuver", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Rejeter une demande de rôle avec motif (US-ROL-02)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Demande REJETEE ; audit tracé.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Motif manquant.' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Demande introuvable.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Demande déjà traitée.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reject_role_request_dto_1.RejectRoleRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AdminRoleRequestsController.prototype, "rejeter", null);
exports.AdminRoleRequestsController = AdminRoleRequestsController = __decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiTags)('admin'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMINISTRATEUR),
    (0, common_1.Controller)('admin/role-requests'),
    __metadata("design:paramtypes", [role_requests_service_1.RoleRequestsService])
], AdminRoleRequestsController);
//# sourceMappingURL=admin-role-requests.controller.js.map
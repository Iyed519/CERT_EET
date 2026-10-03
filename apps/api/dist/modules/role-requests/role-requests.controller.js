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
exports.RoleRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const role_requests_service_1 = require("./role-requests.service");
const create_role_request_dto_1 = require("./dto/create-role-request.dto");
let RoleRequestsController = class RoleRequestsController {
    constructor(roleRequestsService) {
        this.roleRequestsService = roleRequestsService;
    }
    async creer(dto, req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.roleRequestsService.creer(user.sub, dto);
    }
    async listerMes(req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.roleRequestsService.listerMes(user.sub);
    }
};
exports.RoleRequestsController = RoleRequestsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Soumettre une demande de changement de rôle (US-ROL-02)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Demande créée au statut EN_ATTENTE.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Rôle déjà détenu, ou justification invalide.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifié.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Une demande est déjà en attente.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_role_request_dto_1.CreateRoleRequestDto, Object]),
    __metadata("design:returntype", Promise)
], RoleRequestsController.prototype, "creer", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Lister mes demandes de changement de rôle (US-ROL-02)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Mes demandes, la plus récente d\'abord.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifié.' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RoleRequestsController.prototype, "listerMes", null);
exports.RoleRequestsController = RoleRequestsController = __decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiTags)('role-requests'),
    (0, common_1.Controller)('role-requests'),
    __metadata("design:paramtypes", [role_requests_service_1.RoleRequestsService])
], RoleRequestsController);
//# sourceMappingURL=role-requests.controller.js.map
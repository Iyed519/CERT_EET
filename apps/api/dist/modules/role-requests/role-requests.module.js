"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleRequestsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const demande_role_entity_1 = require("../../database/entities/demande-role.entity");
const user_entity_1 = require("../../database/entities/user.entity");
const admin_module_1 = require("../admin/admin.module");
const role_requests_controller_1 = require("./role-requests.controller");
const admin_role_requests_controller_1 = require("./admin-role-requests.controller");
const role_requests_service_1 = require("./role-requests.service");
let RoleRequestsModule = class RoleRequestsModule {
};
exports.RoleRequestsModule = RoleRequestsModule;
exports.RoleRequestsModule = RoleRequestsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([demande_role_entity_1.DemandeRole, user_entity_1.User]), admin_module_1.AdminModule],
        controllers: [role_requests_controller_1.RoleRequestsController, admin_role_requests_controller_1.AdminRoleRequestsController],
        providers: [role_requests_service_1.RoleRequestsService],
    })
], RoleRequestsModule);
//# sourceMappingURL=role-requests.module.js.map
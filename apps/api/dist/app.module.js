"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("./config/config.module");
const database_module_1 = require("./database/database.module");
const redis_module_1 = require("./redis/redis.module");
const mail_module_1 = require("./mail/mail.module");
const audit_module_1 = require("./modules/audit/audit.module");
const health_module_1 = require("./modules/health/health.module");
const auth_module_1 = require("./modules/auth/auth.module");
const referentiel_module_1 = require("./modules/referentiel/referentiel.module");
const admin_module_1 = require("./modules/admin/admin.module");
const role_requests_module_1 = require("./modules/role-requests/role-requests.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            database_module_1.DatabaseModule,
            redis_module_1.RedisModule,
            mail_module_1.MailModule,
            audit_module_1.AuditModule,
            health_module_1.HealthModule,
            auth_module_1.AuthModule,
            referentiel_module_1.ReferentielModule,
            admin_module_1.AdminModule,
            role_requests_module_1.RoleRequestsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
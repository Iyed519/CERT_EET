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
var AuditInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditInterceptor = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const rxjs_1 = require("rxjs");
const audit_service_1 = require("./audit.service");
const audit_decorator_1 = require("./decorators/audit.decorator");
let AuditInterceptor = AuditInterceptor_1 = class AuditInterceptor {
    constructor(reflector, auditService) {
        this.reflector = reflector;
        this.auditService = auditService;
        this.logger = new common_1.Logger(AuditInterceptor_1.name);
    }
    intercept(context, next) {
        const action = this.reflector.getAllAndOverride(audit_decorator_1.AUDIT_ACTION_KEY, [context.getHandler(), context.getClass()]);
        if (!action) {
            return next.handle();
        }
        const request = context.switchToHttp().getRequest();
        const acteur = request.user?.sub ?? null;
        const adresseIp = request.ip ?? null;
        return next.handle().pipe((0, rxjs_1.tap)({
            next: () => {
                void this.journaliser(action, acteur, adresseIp, 'Succès');
            },
            error: () => {
                void this.journaliser(action, acteur, adresseIp, 'Échec');
            },
        }));
    }
    async journaliser(action, acteur, adresseIp, resultat) {
        try {
            await this.auditService.record({ action, acteur, adresseIp, resultat });
        }
        catch (erreur) {
            this.logger.error(`Échec d'écriture d'audit pour l'action ${action}`, erreur.stack);
        }
    }
};
exports.AuditInterceptor = AuditInterceptor;
exports.AuditInterceptor = AuditInterceptor = AuditInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        audit_service_1.AuditService])
], AuditInterceptor);
//# sourceMappingURL=audit.interceptor.js.map
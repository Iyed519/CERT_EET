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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const role_enum_1 = require("../../database/enums/role.enum");
const audit_decorator_1 = require("./decorators/audit.decorator");
const audit_service_1 = require("./audit.service");
const audit_query_dto_1 = require("./dto/audit-query.dto");
const audit_csv_util_1 = require("./audit-csv.util");
let AuditController = class AuditController {
    constructor(auditService) {
        this.auditService = auditService;
    }
    list(query) {
        return this.auditService.list(query);
    }
    async export(query, res) {
        const lignes = await this.auditService.export(query);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.csv"`);
        return '﻿' + (0, audit_csv_util_1.auditLogsToCsv)(lignes);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    (0, audit_decorator_1.Audit)('AUDIT_CONSULTE'),
    (0, swagger_1.ApiOperation)({ summary: "Consulter le journal d'audit (US-AUTH-12, DS-16)" }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Entrées paginées { items, total, page, limit }, tri horodatage DESC.',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Filtres invalides (UUID, date…).' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [audit_query_dto_1.AuditQueryDto]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('export'),
    (0, audit_decorator_1.Audit)('AUDIT_EXPORTE'),
    (0, swagger_1.ApiOperation)({
        summary: "Exporter le journal d'audit en CSV (US-AUTH-12, DS-16)",
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Fichier CSV (toutes les lignes filtrées).',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Filtres invalides (UUID, date…).' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Rôle insuffisant (non-admin).' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [audit_query_dto_1.AuditQueryDto, Object]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "export", null);
exports.AuditController = AuditController = __decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiTags)('admin'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMINISTRATEUR),
    (0, common_1.Controller)('admin/audit-logs'),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map
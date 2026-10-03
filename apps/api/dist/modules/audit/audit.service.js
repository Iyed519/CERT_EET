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
var AuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_log_entity_1 = require("../../database/entities/audit-log.entity");
let AuditService = AuditService_1 = class AuditService {
    constructor(auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }
    async record(input) {
        const entry = this.auditLogRepository.create({
            userId: input.acteur ?? null,
            action: input.action,
            cible: input.cible ?? null,
            adresseIp: input.adresseIp ?? null,
            resultat: input.resultat ?? null,
            detailsAvantApres: input.detailsAvantApres ?? null,
        });
        await this.auditLogRepository.save(entry);
    }
    async list(query) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const [items, total] = await this.auditLogRepository.findAndCount({
            where: this.buildWhere(query),
            order: { horodatage: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { items, total, page, limit };
    }
    async export(query) {
        return this.auditLogRepository.find({
            where: this.buildWhere(query),
            order: { horodatage: 'DESC' },
            take: AuditService_1.MAX_EXPORT,
        });
    }
    buildWhere(query) {
        const where = {};
        if (query.action) {
            where.action = query.action;
        }
        if (query.userId) {
            where.userId = query.userId;
        }
        const from = query.from ? new Date(query.from) : null;
        const to = query.to ? new Date(query.to) : null;
        if (from && to) {
            where.horodatage = (0, typeorm_2.Between)(from, to);
        }
        else if (from) {
            where.horodatage = (0, typeorm_2.MoreThanOrEqual)(from);
        }
        else if (to) {
            where.horodatage = (0, typeorm_2.LessThanOrEqual)(to);
        }
        return where;
    }
};
exports.AuditService = AuditService;
AuditService.MAX_EXPORT = 100000;
exports.AuditService = AuditService = AuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AuditService);
//# sourceMappingURL=audit.service.js.map
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemandeRole = void 0;
const typeorm_1 = require("typeorm");
const role_demande_enum_1 = require("../enums/role-demande.enum");
const statut_demande_enum_1 = require("../enums/statut-demande.enum");
let DemandeRole = class DemandeRole {
};
exports.DemandeRole = DemandeRole;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], DemandeRole.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], DemandeRole.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'role_demande', type: 'enum', enum: role_demande_enum_1.RoleDemande }),
    __metadata("design:type", String)
], DemandeRole.prototype, "roleDemande", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], DemandeRole.prototype, "justification", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: statut_demande_enum_1.StatutDemande,
        default: statut_demande_enum_1.StatutDemande.EN_ATTENTE,
    }),
    __metadata("design:type", String)
], DemandeRole.prototype, "statut", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], DemandeRole.prototype, "motif", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'traite_par', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], DemandeRole.prototype, "traitePar", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], DemandeRole.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'traite_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], DemandeRole.prototype, "traiteAt", void 0);
exports.DemandeRole = DemandeRole = __decorate([
    (0, typeorm_1.Entity)('demandes_role')
], DemandeRole);
//# sourceMappingURL=demande-role.entity.js.map
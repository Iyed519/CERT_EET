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
exports.ListRoleRequestsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const statut_demande_enum_1 = require("../../../database/enums/statut-demande.enum");
class ListRoleRequestsDto {
    constructor() {
        this.page = 1;
        this.limit = 50;
    }
}
exports.ListRoleRequestsDto = ListRoleRequestsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: statut_demande_enum_1.StatutDemande,
        description: 'Filtre sur le statut (par défaut : tous).',
        example: statut_demande_enum_1.StatutDemande.EN_ATTENTE,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(statut_demande_enum_1.StatutDemande, {
        message: 'statut invalide : EN_ATTENTE, APPROUVEE ou REJETEE.',
    }),
    __metadata("design:type", String)
], ListRoleRequestsDto.prototype, "statut", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: 'page doit être un entier.' }),
    (0, class_validator_1.Min)(1, { message: 'page doit être >= 1.' }),
    __metadata("design:type", Number)
], ListRoleRequestsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 50, minimum: 1, maximum: 200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: 'limit doit être un entier.' }),
    (0, class_validator_1.Min)(1, { message: 'limit doit être >= 1.' }),
    (0, class_validator_1.Max)(200, { message: 'limit ne peut excéder 200.' }),
    __metadata("design:type", Number)
], ListRoleRequestsDto.prototype, "limit", void 0);
//# sourceMappingURL=list-role-requests.dto.js.map
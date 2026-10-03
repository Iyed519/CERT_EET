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
exports.CreateRoleRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const role_demande_enum_1 = require("../../../database/enums/role-demande.enum");
class CreateRoleRequestDto {
}
exports.CreateRoleRequestDto = CreateRoleRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: role_demande_enum_1.RoleDemande, example: role_demande_enum_1.RoleDemande.FORMATEUR }),
    (0, class_validator_1.IsEnum)(role_demande_enum_1.RoleDemande, {
        message: 'Rôle demandé invalide : FORMATEUR ou ADMINISTRATEUR attendu.',
    }),
    __metadata("design:type", String)
], CreateRoleRequestDto.prototype, "roleDemande", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Je conçois les TP du module réseau et souhaite les évaluer.',
        maxLength: 1000,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'La justification est requise.' }),
    (0, class_validator_1.MaxLength)(1000, {
        message: 'La justification ne peut excéder 1000 caractères.',
    }),
    __metadata("design:type", String)
], CreateRoleRequestDto.prototype, "justification", void 0);
//# sourceMappingURL=create-role-request.dto.js.map
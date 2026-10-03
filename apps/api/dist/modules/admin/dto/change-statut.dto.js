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
exports.ChangeStatutDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const statut_compte_enum_1 = require("../../../database/enums/statut-compte.enum");
class ChangeStatutDto {
}
exports.ChangeStatutDto = ChangeStatutDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [statut_compte_enum_1.StatutCompte.ACTIF, statut_compte_enum_1.StatutCompte.DESACTIVE],
        example: statut_compte_enum_1.StatutCompte.DESACTIVE,
    }),
    (0, class_validator_1.IsIn)([statut_compte_enum_1.StatutCompte.ACTIF, statut_compte_enum_1.StatutCompte.DESACTIVE], {
        message: 'Statut cible invalide : DESACTIVE ou ACTIF attendu.',
    }),
    __metadata("design:type", String)
], ChangeStatutDto.prototype, "statut", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Départ de l\'entreprise.' }),
    (0, class_validator_1.ValidateIf)((dto) => dto.statut === statut_compte_enum_1.StatutCompte.DESACTIVE),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Le motif est requis pour désactiver un compte.' }),
    (0, class_validator_1.MaxLength)(500, { message: 'Le motif ne peut excéder 500 caractères.' }),
    __metadata("design:type", String)
], ChangeStatutDto.prototype, "motif", void 0);
//# sourceMappingURL=change-statut.dto.js.map
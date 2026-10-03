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
exports.CompleteProfileDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const niveau_etudes_enum_1 = require("../../../database/enums/niveau-etudes.enum");
class CompleteProfileDto {
}
exports.CompleteProfileDto = CompleteProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2003-05-19', description: 'Date de naissance (ISO)' }),
    (0, class_validator_1.IsDateString)({}, { message: 'Date de naissance invalide (format attendu AAAA-MM-JJ).' }),
    __metadata("design:type", String)
], CompleteProfileDto.prototype, "dateNaissance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: niveau_etudes_enum_1.NiveauEtudes, example: niveau_etudes_enum_1.NiveauEtudes.LICENCE }),
    (0, class_validator_1.IsEnum)(niveau_etudes_enum_1.NiveauEtudes, { message: "Niveau d'études invalide." }),
    __metadata("design:type", String)
], CompleteProfileDto.prototype, "niveauEtudes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: 'true = en études (domaine + établissement) ; false = ni l\'un ni l\'autre',
    }),
    (0, class_validator_1.IsBoolean)({ message: 'Le champ « en études » doit être un booléen.' }),
    __metadata("design:type", Boolean)
], CompleteProfileDto.prototype, "enEtudes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { message: "Domaine d'études invalide." }),
    __metadata("design:type", String)
], CompleteProfileDto.prototype, "domaineEtudesId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'uuid' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { message: 'Établissement invalide.' }),
    __metadata("design:type", String)
], CompleteProfileDto.prototype, "etablissementId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Mon établissement hors liste',
        description: 'Texte libre si l\'établissement n\'est pas dans le référentiel',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], CompleteProfileDto.prototype, "etablissementAutre", void 0);
//# sourceMappingURL=complete-profile.dto.js.map
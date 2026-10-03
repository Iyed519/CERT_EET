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
exports.ChangeRoleDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const role_enum_1 = require("../../../database/enums/role.enum");
class ChangeRoleDto {
}
exports.ChangeRoleDto = ChangeRoleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: role_enum_1.Role, example: role_enum_1.Role.FORMATEUR }),
    (0, class_validator_1.IsEnum)(role_enum_1.Role, { message: 'Rôle cible invalide.' }),
    __metadata("design:type", String)
], ChangeRoleDto.prototype, "nouveauRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'MotDePasseAdmin123!' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Le mot de passe administrateur est requis.' }),
    __metadata("design:type", String)
], ChangeRoleDto.prototype, "motDePasseAdmin", void 0);
//# sourceMappingURL=change-role.dto.js.map
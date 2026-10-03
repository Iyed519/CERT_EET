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
exports.MfaCodeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class MfaCodeDto {
}
exports.MfaCodeDto = MfaCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456', description: 'Code TOTP a 6 chiffres.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Le code est requis.' }),
    (0, class_validator_1.Matches)(/^[0-9]{6}$/, { message: 'Le code doit comporter 6 chiffres.' }),
    __metadata("design:type", String)
], MfaCodeDto.prototype, "code", void 0);
//# sourceMappingURL=mfa-code.dto.js.map
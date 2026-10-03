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
exports.Etablissement = void 0;
const typeorm_1 = require("typeorm");
const universite_entity_1 = require("./universite.entity");
let Etablissement = class Etablissement {
};
exports.Etablissement = Etablissement;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Etablissement.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'universite_id', type: 'uuid' }),
    __metadata("design:type", String)
], Etablissement.prototype, "universiteId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => universite_entity_1.Universite, (universite) => universite.etablissements, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'universite_id' }),
    __metadata("design:type", universite_entity_1.Universite)
], Etablissement.prototype, "universite", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Etablissement.prototype, "nom", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], Etablissement.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], Etablissement.prototype, "gouvernorat", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Etablissement.prototype, "createdAt", void 0);
exports.Etablissement = Etablissement = __decorate([
    (0, typeorm_1.Entity)('etablissements')
], Etablissement);
//# sourceMappingURL=etablissement.entity.js.map
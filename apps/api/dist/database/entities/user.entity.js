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
exports.User = void 0;
const typeorm_1 = require("typeorm");
const role_enum_1 = require("../enums/role.enum");
const statut_compte_enum_1 = require("../enums/statut-compte.enum");
const niveau_etudes_enum_1 = require("../enums/niveau-etudes.enum");
const domaine_etudes_entity_1 = require("./domaine-etudes.entity");
const etablissement_entity_1 = require("./etablissement.entity");
let User = class User {
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "nom", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "prenom", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'mot_de_passe_hash',
        type: 'varchar',
        length: 255,
        nullable: true,
    }),
    __metadata("design:type", Object)
], User.prototype, "motDePasseHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: role_enum_1.Role }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: statut_compte_enum_1.StatutCompte,
        default: statut_compte_enum_1.StatutCompte.EN_ATTENTE_ACTIVATION,
    }),
    __metadata("design:type", String)
], User.prototype, "statut", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mfa_active', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "mfaActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mfa_secret', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "mfaSecret", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'derniere_connexion', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "derniereConnexion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'date_naissance', type: 'date', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "dateNaissance", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'niveau_etudes',
        type: 'enum',
        enum: niveau_etudes_enum_1.NiveauEtudes,
        nullable: true,
    }),
    __metadata("design:type", Object)
], User.prototype, "niveauEtudes", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'domaine_etudes_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "domaineEtudesId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => domaine_etudes_entity_1.DomaineEtudes, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'domaine_etudes_id' }),
    __metadata("design:type", Object)
], User.prototype, "domaineEtudes", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'etablissement_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "etablissementId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => etablissement_entity_1.Etablissement, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'etablissement_id' }),
    __metadata("design:type", Object)
], User.prototype, "etablissement", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'etablissement_autre',
        type: 'varchar',
        length: 255,
        nullable: true,
    }),
    __metadata("design:type", Object)
], User.prototype, "etablissementAutre", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'profil_complet', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "profilComplet", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users')
], User);
//# sourceMappingURL=user.entity.js.map
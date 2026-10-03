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
exports.EtablissementDomaine = void 0;
const typeorm_1 = require("typeorm");
const etablissement_entity_1 = require("./etablissement.entity");
const domaine_etudes_entity_1 = require("./domaine-etudes.entity");
let EtablissementDomaine = class EtablissementDomaine {
};
exports.EtablissementDomaine = EtablissementDomaine;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], EtablissementDomaine.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'etablissement_id', type: 'uuid' }),
    __metadata("design:type", String)
], EtablissementDomaine.prototype, "etablissementId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => etablissement_entity_1.Etablissement, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'etablissement_id' }),
    __metadata("design:type", etablissement_entity_1.Etablissement)
], EtablissementDomaine.prototype, "etablissement", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'domaine_id', type: 'uuid' }),
    __metadata("design:type", String)
], EtablissementDomaine.prototype, "domaineId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => domaine_etudes_entity_1.DomaineEtudes, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'domaine_id' }),
    __metadata("design:type", domaine_etudes_entity_1.DomaineEtudes)
], EtablissementDomaine.prototype, "domaine", void 0);
exports.EtablissementDomaine = EtablissementDomaine = __decorate([
    (0, typeorm_1.Index)(['etablissementId', 'domaineId'], { unique: true }),
    (0, typeorm_1.Entity)('etablissement_domaine')
], EtablissementDomaine);
//# sourceMappingURL=etablissement-domaine.entity.js.map
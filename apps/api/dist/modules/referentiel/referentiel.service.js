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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferentielService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const domaine_etudes_entity_1 = require("../../database/entities/domaine-etudes.entity");
const etablissement_entity_1 = require("../../database/entities/etablissement.entity");
let ReferentielService = class ReferentielService {
    constructor(domaineRepository, etablissementRepository) {
        this.domaineRepository = domaineRepository;
        this.etablissementRepository = etablissementRepository;
    }
    getDomaines() {
        return this.domaineRepository.find({ order: { libelle: 'ASC' } });
    }
    async getEtablissements() {
        const rows = await this.etablissementRepository.find({
            relations: { universite: true },
            order: { nom: 'ASC' },
        });
        return rows.map((e) => ({
            id: e.id,
            nom: e.nom,
            type: e.type,
            gouvernorat: e.gouvernorat,
            universite: e.universite
                ? { id: e.universite.id, nom: e.universite.nom, type: e.universite.type }
                : null,
        }));
    }
};
exports.ReferentielService = ReferentielService;
exports.ReferentielService = ReferentielService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(domaine_etudes_entity_1.DomaineEtudes)),
    __param(1, (0, typeorm_1.InjectRepository)(etablissement_entity_1.Etablissement)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], ReferentielService);
//# sourceMappingURL=referentiel.service.js.map
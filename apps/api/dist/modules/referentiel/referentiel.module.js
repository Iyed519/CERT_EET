"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferentielModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const domaine_etudes_entity_1 = require("../../database/entities/domaine-etudes.entity");
const etablissement_entity_1 = require("../../database/entities/etablissement.entity");
const referentiel_controller_1 = require("./referentiel.controller");
const referentiel_service_1 = require("./referentiel.service");
let ReferentielModule = class ReferentielModule {
};
exports.ReferentielModule = ReferentielModule;
exports.ReferentielModule = ReferentielModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([domaine_etudes_entity_1.DomaineEtudes, etablissement_entity_1.Etablissement])],
        controllers: [referentiel_controller_1.ReferentielController],
        providers: [referentiel_service_1.ReferentielService],
    })
], ReferentielModule);
//# sourceMappingURL=referentiel.module.js.map
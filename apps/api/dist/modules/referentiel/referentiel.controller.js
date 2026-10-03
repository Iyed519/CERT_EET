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
exports.ReferentielController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const referentiel_service_1 = require("./referentiel.service");
let ReferentielController = class ReferentielController {
    constructor(referentielService) {
        this.referentielService = referentielService;
    }
    getDomaines() {
        return this.referentielService.getDomaines();
    }
    getEtablissements() {
        return this.referentielService.getEtablissements();
    }
};
exports.ReferentielController = ReferentielController;
__decorate([
    (0, common_1.Get)('domaines'),
    (0, swagger_1.ApiOperation)({ summary: "Liste des domaines d'études (US-AUTH-15)" }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Domaines triés par intitulé.' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReferentielController.prototype, "getDomaines", null);
__decorate([
    (0, common_1.Get)('etablissements'),
    (0, swagger_1.ApiOperation)({ summary: 'Liste des établissements (US-AUTH-15)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Établissements (avec université), triés par nom.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReferentielController.prototype, "getEtablissements", null);
exports.ReferentielController = ReferentielController = __decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiTags)('referentiel'),
    (0, common_1.Controller)('referentiel'),
    __metadata("design:paramtypes", [referentiel_service_1.ReferentielService])
], ReferentielController);
//# sourceMappingURL=referentiel.controller.js.map
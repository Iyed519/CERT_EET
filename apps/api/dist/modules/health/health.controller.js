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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const terminus_1 = require("@nestjs/terminus");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let HealthController = class HealthController {
    constructor(health, memory, configService) {
        this.health = health;
        this.memory = memory;
        this.configService = configService;
    }
    get heapThresholdBytes() {
        const { nodeEnv } = this.configService.getOrThrow('app');
        const isTestRun = nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined;
        const megabytes = isTestRun ? 4096 : 300;
        return megabytes * 1024 * 1024;
    }
    check() {
        return this.health.check([
            () => this.memory.checkHeap('memory_heap', this.heapThresholdBytes),
        ]);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, public_decorator_1.Public)(),
    (0, terminus_1.HealthCheck)(),
    (0, swagger_1.ApiOperation)({ summary: 'Vérifie la disponibilité de l’API (liveness)' }),
    (0, swagger_1.ApiOkResponse)({
        description: "API disponible. Renvoie le statut Terminus (status 'ok' + détail des indicateurs, ex. memory_heap).",
        schema: {
            example: {
                status: 'ok',
                info: { memory_heap: { status: 'up' } },
                error: {},
                details: { memory_heap: { status: 'up' } },
            },
        },
    }),
    (0, swagger_1.ApiServiceUnavailableResponse)({
        description: "Un indicateur est en échec (ex. heap au-dessus du seuil) : status 'error'.",
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('health'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        terminus_1.MemoryHealthIndicator,
        config_1.ConfigService])
], HealthController);
//# sourceMappingURL=health.controller.js.map
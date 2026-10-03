"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
const redis_constants_1 = require("./redis.constants");
const redis_service_1 = require("./redis.service");
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: redis_constants_1.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const { host, port } = configService.getOrThrow('redis');
                    const logger = new common_1.Logger('RedisClient');
                    const client = new ioredis_1.default({ host, port });
                    client.on('connect', () => logger.log(`Connecté à Redis (${host}:${port})`));
                    client.on('error', (err) => logger.error(`Erreur Redis : ${err.message}`));
                    return client;
                },
            },
            redis_service_1.RedisService,
        ],
        exports: [redis_service_1.RedisService, redis_constants_1.REDIS_CLIENT],
    })
], RedisModule);
//# sourceMappingURL=redis.module.js.map
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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const fs = require("fs");
const redis_service_1 = require("../../../redis/redis.service");
const public_decorator_1 = require("../decorators/public.decorator");
const auth_keys_1 = require("../auth.keys");
let JwtAuthGuard = class JwtAuthGuard {
    constructor(reflector, jwtService, configService, redisService) {
        this.reflector = reflector;
        this.jwtService = jwtService;
        this.configService = configService;
        this.redisService = redisService;
        const jwtConfig = this.configService.getOrThrow('jwt');
        this.publicKey = fs.readFileSync(jwtConfig.publicKeyPath, 'utf8');
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const token = this.extractToken(request);
        if (!token) {
            throw new common_1.UnauthorizedException('Authentification requise.');
        }
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(token, {
                publicKey: this.publicKey,
                algorithms: ['RS256'],
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Session invalide ou expirée.');
        }
        if (await this.redisService.exists((0, auth_keys_1.accessDenylistKey)(payload.jti))) {
            throw new common_1.UnauthorizedException('Session invalide ou expirée.');
        }
        const validAfter = await this.redisService.get((0, auth_keys_1.sessionsValidAfterKey)(payload.sub));
        if (validAfter && payload.iat < Number(validAfter)) {
            throw new common_1.UnauthorizedException('Session invalide ou expirée.');
        }
        request.user = payload;
        return true;
    }
    extractToken(request) {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice('Bearer '.length);
        }
        return null;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map
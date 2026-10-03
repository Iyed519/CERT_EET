import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../redis/redis.service';
export declare class JwtAuthGuard implements CanActivate {
    private readonly reflector;
    private readonly jwtService;
    private readonly configService;
    private readonly redisService;
    private readonly publicKey;
    constructor(reflector: Reflector, jwtService: JwtService, configService: ConfigService, redisService: RedisService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
}

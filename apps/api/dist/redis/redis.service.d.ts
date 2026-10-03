import { OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
export declare class RedisService implements OnModuleDestroy {
    private readonly client;
    constructor(client: Redis);
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    exists(key: string): Promise<boolean>;
    del(key: string): Promise<void>;
    onModuleDestroy(): Promise<void>;
}

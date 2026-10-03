import { ConfigService } from '@nestjs/config';
import { HealthCheckResult, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
export declare class HealthController {
    private readonly health;
    private readonly memory;
    private readonly configService;
    constructor(health: HealthCheckService, memory: MemoryHealthIndicator, configService: ConfigService);
    private get heapThresholdBytes();
    check(): Promise<HealthCheckResult>;
}

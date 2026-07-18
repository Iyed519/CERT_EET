import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { AppConfig } from '../../config/configuration';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Endpoint de santé — US-INFRA-02. @Public() : le healthcheck Docker ne
 * présente aucun jeton, la route doit rester ouverte malgré le JwtAuthGuard
 * global (US-AUTH-11).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Seuil du heap. En prod/dev : 300 Mo (détection de fuite réelle). Sous les
   * tests, le MÊME process Node héberge le compilateur TS + plusieurs instances
   * de l'app : le heap mesuré n'a plus de rapport avec la conso réelle. On
   * relève donc largement le seuil dès qu'on tourne sous jest — détecté par
   * JEST_WORKER_ID (toujours défini par le runner, même quand le conteneur
   * force NODE_ENV=development) ou par NODE_ENV=test.
   */
  private get heapThresholdBytes(): number {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    const isTestRun =
      nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined;
    const megabytes = isTestRun ? 4096 : 300;
    return megabytes * 1024 * 1024;
  }

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Vérifie la disponibilité de l’API (liveness)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      (): Promise<HealthIndicatorResult> =>
        this.memory.checkHeap('memory_heap', this.heapThresholdBytes),
    ]);
  }
}

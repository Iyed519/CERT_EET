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

/**
 * Endpoint de santé — US-INFRA-02.
 *
 * Niveau INF02 : liveness check (le process répond, mémoire sous contrôle).
 * Les indicateurs de readiness (Postgres prêt, Redis joignable) seront ajoutés
 * plus tard — c'est ce check que Docker Compose interroge via son healthcheck
 * pour ordonnancer le démarrage (l'API attend Postgres prêt).
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
   * Seuil du heap. En production l'API seule reste très en deçà de 300 Mo.
   * En test (jest + ts-jest), le MÊME process Node garde le compilateur
   * TypeScript en mémoire ET démarre l'application plusieurs fois : le heap
   * réel dépasse alors 300 Mo sans la moindre fuite. On relève donc le seuil
   * uniquement en environnement de test — en prod/dev il reste volontairement
   * strict (son vrai rôle : détecter une fuite mémoire).
   */
  private get heapThresholdBytes(): number {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    const megabytes = nodeEnv === 'test' ? 1024 : 300;
    return megabytes * 1024 * 1024;
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Vérifie la disponibilité de l’API (liveness)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      (): Promise<HealthIndicatorResult> =>
        this.memory.checkHeap('memory_heap', this.heapThresholdBytes),
    ]);
  }
}
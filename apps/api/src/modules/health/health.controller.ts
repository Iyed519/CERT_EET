import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

/**
 * Endpoint de santé — US-INFRA-02.
 *
 * Niveau INF02 : liveness check (le process répond, mémoire sous contrôle).
 * Les indicateurs de readiness (Postgres prêt, Redis joignable) seront ajoutés
 * en INF03/INF04 — c'est ce check que Docker Compose interrogera via son
 * healthcheck pour ordonnancer le démarrage (l'API attend Postgres prêt).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Vérifie la disponibilité de l’API (liveness)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Seuil large : alerte si l'usage du heap dépasse 300 Mo.
      (): Promise<HealthIndicatorResult> => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get<HealthController>(HealthController);
  });

  it('est défini', () => {
    expect(controller).toBeDefined();
  });

  it('retourne un statut "ok" pour le liveness', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.details).toHaveProperty('memory_heap');
  });
});
